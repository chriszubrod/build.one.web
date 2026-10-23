import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { flushUntil } from "../../__testutils__/flush";
import ExpenseReceiptMatch from "./ExpenseReceiptMatch";
import { ApiError } from "../../api/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUploadFile = vi.fn();
const mockPost = vi.fn();
const mockReload = vi.fn();

vi.mock("../../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../api/client")>();
  return {
    ...mod,
    uploadFile: (...args: unknown[]) => mockUploadFile(...args),
    post: (...args: unknown[]) => mockPost(...args),
  };
});

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function sampleCandidate(overrides: Record<string, unknown> = {}) {
  return {
    public_id: "exp-c1",
    vendor_name: "Acme Supply",
    expense_date: "2026-03-15",
    total_amount: "42.50",
    reference_number: "REF-1",
    is_draft: true,
    status: "draft",
    is_completed: false,
    vendor_matches: true,
    days_apart: 0,
    ...overrides,
  };
}

function matchedRead(overrides: Record<string, unknown> = {}) {
  return {
    status: "matched" as const,
    message: null,
    fields: {
      vendor_public_id: null,
      vendor_name: "Acme Supply",
      expense_date: "2026-03-15",
      total_amount: "42.50",
      reference_number: null,
    },
    candidates: [sampleCandidate()],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockUploadFile.mockImplementation(async (_path, file: File) => ({
    public_id: `att-${file.name}`,
  }));
  mockPost.mockImplementation(async (path: string) => {
    if (path === "/api/v1/expense/read-receipt") {
      return matchedRead();
    }
    return {
      expense_public_id: "exp-c1",
      expense_line_item_public_id: "line-1",
      attachment_public_id: "att-x",
    };
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
  vi.useRealTimers();
});

async function renderMatch(props: { canUpdate?: boolean; onListRefresh?: () => void } = {}) {
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          { initialEntries: ["/expense/list"] },
          createElement(ExpenseReceiptMatch, {
            canUpdate: props.canUpdate ?? true,
            onListRefresh: props.onListRefresh ?? mockReload,
          }),
        ),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
  });
  await flushUntil(() => container.querySelector(".drop-zone input[type='file']") !== null);
}

async function enqueueViaInput(files: File[]) {
  const fileInput = container.querySelector(".drop-zone input[type='file']") as HTMLInputElement;
  Object.defineProperty(fileInput, "files", { value: files, configurable: true });
  await act(async () => {
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function flushRowIdle() {
  for (let i = 0; i < 40; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    const busy =
      container.textContent?.includes("Uploading") ||
      container.textContent?.includes("Reading") ||
      container.textContent?.includes("Queued");
    if (!busy) return;
  }
}

describe("ExpenseReceiptMatch", () => {
  it("drop → upload then read-receipt with uploaded public_id", async () => {
    const file = new File(["pdf"], "one.pdf", { type: "application/pdf" });
    await renderMatch();
    await enqueueViaInput([file]);
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/expense/read-receipt"));

    expect(mockUploadFile).toHaveBeenCalledWith("/api/v1/upload/attachment", file);
    expect(mockPost).toHaveBeenCalledWith("/api/v1/expense/read-receipt", {
      attachment_public_id: "att-one.pdf",
    });
  });

  it("matched renders candidates in server order with badges and hints", async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path !== "/api/v1/expense/read-receipt") throw new Error("unexpected");
      return matchedRead({
        candidates: [
          sampleCandidate({
            public_id: "exp-z",
            vendor_name: "Zeta Corp",
            vendor_matches: false,
            days_apart: 4,
            is_draft: false,
            status: "completed",
          }),
          sampleCandidate({
            public_id: "exp-a",
            vendor_name: "Alpha Supply",
            vendor_matches: true,
            days_apart: 0,
            is_draft: true,
            status: "draft",
          }),
        ],
      });
    });
    await renderMatch();
    await enqueueViaInput([new File(["p"], "r.pdf", { type: "application/pdf" })]);
    await flushRowIdle();

    const rows = container.querySelectorAll(".receipt-match-candidate");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Zeta Corp");
    expect(rows[0].textContent).toContain("4 days apart");
    expect(rows[0].textContent).not.toContain("vendor matches");
    expect(rows[1].textContent).toContain("Alpha Supply");
    expect(rows[1].textContent).toContain("vendor matches");
    expect(rows[1].textContent).toContain("Draft");
  });

  it("formats contract date-only strings as local calendar dates", async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path !== "/api/v1/expense/read-receipt") throw new Error("unexpected");
      return matchedRead({
        candidates: [
          sampleCandidate({
            expense_date: "2026-03-15",
            vendor_name: "Date Check",
          }),
        ],
      });
    });
    await renderMatch();
    await enqueueViaInput([new File(["p"], "r.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    expect(container.textContent).toContain("03/15/2026");
    expect(container.textContent).not.toContain("03/14/2026");
  });

  it("shows In Review on a candidate when status is in_review", async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path !== "/api/v1/expense/read-receipt") throw new Error("unexpected");
      return matchedRead({
        candidates: [
          sampleCandidate({
            is_draft: false,
            status: "in_review",
            is_completed: false,
          }),
        ],
      });
    });
    await renderMatch();
    await enqueueViaInput([new File(["p"], "r.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    const badge = container.querySelector(".receipt-match-candidate .status-badge");
    expect(badge?.textContent).toBe("In Review");
  });

  it("Attach posts to attach-receipt, shows success link, and refreshes the list", async () => {
    await renderMatch();
    await enqueueViaInput([new File(["p"], "r.pdf", { type: "application/pdf" })]);
    await flushRowIdle();

    const attach = container.querySelector(".receipt-match-candidate button") as HTMLButtonElement;
    await act(async () => {
      attach.click();
    });
    await flushUntil(() => container.textContent?.includes("Attached to"));

    expect(mockPost).toHaveBeenCalledWith("/api/v1/expense/exp-c1/attach-receipt", {
      attachment_public_id: "att-r.pdf",
    });
    expect(mockReload).toHaveBeenCalled();
    const link = container.querySelector(".receipt-match-result a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/expense/exp-c1/edit");
    expect(link.textContent).toContain("Acme Supply");
  });

  it("completed expense links to view, not edit", async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === "/api/v1/expense/read-receipt") {
        return matchedRead({
          candidates: [sampleCandidate({ is_draft: false, public_id: "exp-done" })],
        });
      }
      return {
        expense_public_id: "exp-done",
        expense_line_item_public_id: "line-1",
        attachment_public_id: "att-r.pdf",
      };
    });
    await renderMatch();
    await enqueueViaInput([new File(["p"], "r.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    await act(async () => {
      (container.querySelector(".receipt-match-candidate button") as HTMLButtonElement).click();
    });
    await flushUntil(() => container.querySelector(".receipt-match-result a") !== null);
    expect(container.querySelector(".receipt-match-result a")?.getAttribute("href")).toBe(
      "/expense/exp-done",
    );
  });

  it("409 expense_has_receipt removes the candidate and shows the message", async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === "/api/v1/expense/read-receipt") {
        return matchedRead({
          candidates: [
            sampleCandidate({ public_id: "exp-a" }),
            sampleCandidate({ public_id: "exp-b", vendor_name: "Other" }),
          ],
        });
      }
      throw new ApiError(409, "expense_has_receipt");
    });
    await renderMatch();
    await enqueueViaInput([new File(["p"], "r.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    const buttons = container.querySelectorAll(".receipt-match-candidate button");
    await act(async () => {
      (buttons[0] as HTMLButtonElement).click();
    });
    await flushUntil(() => container.textContent?.includes("already has a receipt"));
    expect(container.querySelectorAll(".receipt-match-candidate")).toHaveLength(1);
    expect(container.textContent).toContain("That expense already has a receipt");
  });

  it("409 attachment_linked on attach shows message and keeps Attach disabled", async () => {
    mockPost.mockImplementation(async (path: string) => {
      if (path === "/api/v1/expense/read-receipt") return matchedRead();
      throw new ApiError(409, "attachment_linked");
    });
    await renderMatch();
    await enqueueViaInput([new File(["p"], "r.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    await act(async () => {
      (container.querySelector(".receipt-match-candidate button") as HTMLButtonElement).click();
    });
    await flushUntil(() => container.textContent?.includes("already attached"));
    expect(container.textContent).toContain("This file is already attached");
    expect(
      (container.querySelector(".receipt-match-candidate button") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("calls the latest onListRefresh after attach completes", async () => {
    const refreshA = vi.fn();
    const refreshB = vi.fn();
    let finishAttach: () => void = () => {};
    const attachGate = new Promise<void>((resolve) => {
      finishAttach = resolve;
    });
    mockPost.mockImplementation(async (path: string) => {
      if (path === "/api/v1/expense/read-receipt") return matchedRead();
      await attachGate;
      return {
        expense_public_id: "exp-c1",
        expense_line_item_public_id: "line-1",
        attachment_public_id: "att-r.pdf",
      };
    });
    await renderMatch({ onListRefresh: refreshA });
    await enqueueViaInput([new File(["p"], "r.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    await act(async () => {
      (container.querySelector(".receipt-match-candidate button") as HTMLButtonElement).click();
    });

    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            MemoryRouter,
            { initialEntries: ["/expense/list"] },
            createElement(ExpenseReceiptMatch, {
              canUpdate: true,
              onListRefresh: refreshB,
            }),
          ),
        ),
      );
    });

    await act(async () => {
      finishAttach();
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushUntil(() => refreshB.mock.calls.length > 0);
    expect(refreshB).toHaveBeenCalled();
    expect(refreshA).not.toHaveBeenCalled();
  });

  it("no_match and unreadable copy", async () => {
    mockPost.mockImplementationOnce(async () => ({
      status: "no_match",
      message: null,
      fields: {
        vendor_name: "Shop",
        expense_date: "2026-01-10",
        total_amount: "99.00",
        vendor_public_id: null,
        reference_number: null,
      },
      candidates: [],
    }));
    await renderMatch();
    await enqueueViaInput([new File(["p"], "a.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    expect(container.textContent).toContain("No expense without a receipt matches");
    expect(container.textContent).toContain("New Expense");

    mockPost.mockImplementationOnce(async () => ({
      status: "unreadable",
      message: null,
      fields: {
        vendor_name: null,
        expense_date: null,
        total_amount: null,
        vendor_public_id: null,
        reference_number: null,
      },
      candidates: [],
    }));
    await enqueueViaInput([new File(["p"], "b.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    expect(container.textContent).toContain("Couldn't read a total from this receipt.");
  });

  it("disabled and ai_unavailable show server message when present", async () => {
    mockPost.mockImplementationOnce(async () => ({
      status: "disabled",
      message: "Ops turned off AI reads.",
      fields: {},
      candidates: [],
    }));
    await renderMatch();
    await enqueueViaInput([new File(["p"], "a.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    expect(container.textContent).toContain("Ops turned off AI reads.");

    mockPost.mockImplementationOnce(async () => ({
      status: "ai_unavailable",
      message: null,
      fields: {},
      candidates: [],
    }));
    await enqueueViaInput([new File(["p"], "b.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    expect(container.textContent).toContain("Receipt reading isn't available right now.");
  });

  it("409 attachment_linked on read shows dedicated copy", async () => {
    mockPost.mockRejectedValueOnce(new ApiError(409, "attachment_linked"));
    await renderMatch();
    await enqueueViaInput([new File(["p"], "dup.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    expect(container.textContent).toContain("This file is already attached elsewhere.");
  });

  it("generic error never shows raw server detail", async () => {
    mockPost.mockRejectedValueOnce(new ApiError(500, "ODBC Driver 18 for SQL Server"));
    await renderMatch();
    await enqueueViaInput([new File(["p"], "bad.pdf", { type: "application/pdf" })]);
    await flushRowIdle();
    expect(container.textContent).toContain("Couldn't read this receipt.");
    expect(container.textContent).not.toContain("ODBC");
  });

  it("processes two files one after another", async () => {
    let readCalls = 0;
    let readsInFlight = 0;
    let maxReadsInFlight = 0;
    mockPost.mockImplementation(async (path: string) => {
      if (path !== "/api/v1/expense/read-receipt") throw new Error("unexpected");
      readCalls += 1;
      readsInFlight += 1;
      maxReadsInFlight = Math.max(maxReadsInFlight, readsInFlight);
      await new Promise((r) => setTimeout(r, 30));
      readsInFlight -= 1;
      const n = readCalls;
      return matchedRead({
        fields: {
          vendor_name: `V${n}`,
          expense_date: "2026-03-15",
          total_amount: "10.00",
          vendor_public_id: null,
          reference_number: null,
        },
        candidates: [sampleCandidate({ public_id: `exp-${n}`, vendor_name: `V${n}` })],
      });
    });

    await renderMatch();
    await enqueueViaInput([
      new File(["a"], "first.pdf", { type: "application/pdf" }),
      new File(["b"], "second.pdf", { type: "application/pdf" }),
    ]);

    await flushRowIdle();
    expect(readCalls).toBe(2);
    expect(maxReadsInFlight).toBe(1);
    expect(container.textContent).toContain("first.pdf");
    expect(container.textContent).toContain("second.pdf");
  });

  it("hides the drop zone without update permission", async () => {
    await renderMatch({ canUpdate: false });
    expect(container.querySelector(".drop-zone")).toBeNull();
  });
});
