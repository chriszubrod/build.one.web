import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue } from "../../__testutils__/domEvents";
import BillList, { draftAttachmentErrorMessage } from "./BillList";
import { ApiError, OfflineError } from "../../api/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = vi.fn();
const mockUploadFile = vi.fn();
const mockPost = vi.fn();
const mockReload = vi.fn();
const mockToast = vi.fn();

const mockListState = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>,
  search: "",
}));
const mockSetSearch = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../api/client")>();
  return {
    ...mod,
    uploadFile: (...args: unknown[]) => mockUploadFile(...args),
    post: (...args: unknown[]) => mockPost(...args),
  };
});

vi.mock("../../hooks/usePaginatedList", () => ({
  usePaginatedList: () => ({
    items: mockListState.items,
    total: mockListState.items.length,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    loading: false,
    error: "",
    setPage: vi.fn(),
    setSearch: (s: string) => {
      mockListState.search = s;
      mockSetSearch(s);
    },
    search: mockListState.search,
    reload: mockReload,
  }),
}));

vi.mock("../../hooks/useIdNameMap", () => ({
  useIdNameMap: () => new Map<number, string>(),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockListState.items = [];
  mockListState.search = "";
  mockSetSearch.mockClear();
  mockUploadFile.mockImplementation(async () => ({ public_id: "att-1" }));
  mockPost.mockImplementation(async () => ({
    bill_public_id: "bill-new",
    existing: false,
    existing_reason: null,
    read_status: "ok",
  }));
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

function renderList() {
  return act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, { initialEntries: ["/bill/list"] }, createElement(BillList)),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function mountList() {
  await renderList();
  await flushUntil(() => container.querySelector(".drop-zone input[type='file']") !== null);
}

async function enqueueViaInput(files: File[]) {
  const fileInput = container.querySelector(".drop-zone input[type='file']") as HTMLInputElement;
  Object.defineProperty(fileInput, "files", { value: files, configurable: true });
  await act(async () => {
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function dropFiles(files: File[]) {
  await mountList();
  await enqueueViaInput(files);
}

async function flushQueueIdle() {
  for (let i = 0; i < 30; i++) {
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

function openLinks() {
  return Array.from(container.querySelectorAll("a")).filter((a) => a.textContent?.includes("Open"));
}

function removeButtonForFile(name: string) {
  const rows = Array.from(container.querySelectorAll(".pending-files tbody tr"));
  for (const row of rows) {
    if (row.textContent?.includes(name)) {
      return row.querySelector("button") as HTMLButtonElement | null;
    }
  }
  return null;
}

describe("draftAttachmentErrorMessage", () => {
  it("maps 500 driver detail to fixed copy only", () => {
    const err = new ApiError(500, "ODBC Driver 18 for SQL Server");
    expect(draftAttachmentErrorMessage(err)).toBe("Couldn't create a draft from this file.");
    expect(draftAttachmentErrorMessage(err)).not.toContain("ODBC");
  });

  it("survives list-shaped ApiError detail without crashing", () => {
    const err = new ApiError(422, "validation");
    (err as { detail: unknown }).detail = [{ loc: ["body"], msg: "bad", type: "value_error" }];
    expect(() => draftAttachmentErrorMessage(err)).not.toThrow();
    expect(draftAttachmentErrorMessage(err)).toBe("Couldn't create a draft from this file.");
  });

  it("maps offline to connected copy", () => {
    expect(draftAttachmentErrorMessage(new OfflineError())).toBe(
      "You're offline — try again when connected.",
    );
  });
});

describe("BillList PDF draft intake", () => {
  it("uploads then drafts and navigates to edit for a single PDF", async () => {
    const file = new File(["pdf"], "one.pdf", { type: "application/pdf" });
    await dropFiles([file]);
    await flushUntil(() => mockNavigate.mock.calls.length > 0);

    expect(mockUploadFile).toHaveBeenCalledWith("/api/v1/upload/attachment", file);
    expect(mockPost).toHaveBeenCalledWith("/api/v1/bill/draft-from-attachment", {
      attachment_public_id: "att-1",
    });
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-new/edit");
    expect(mockReload).toHaveBeenCalled();
  });

  it("1 PDF + 1 PNG still navigates (solo = one accepted PDF)", async () => {
    const pdf = new File(["pdf"], "one.pdf", { type: "application/pdf" });
    const png = new File(["x"], "x.png", { type: "image/png" });
    await dropFiles([pdf, png]);
    await flushUntil(() => mockNavigate.mock.calls.length > 0);
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-new/edit");
    expect(container.textContent).toContain("Only PDF files");
  });

  it("toasts when opening an existing draft (same_pdf)", async () => {
    mockPost.mockResolvedValueOnce({
      bill_public_id: "bill-existing",
      existing: true,
      existing_reason: "same_pdf",
      read_status: "ok",
    });
    const file = new File(["pdf"], "dup.pdf", { type: "application/pdf" });
    await dropFiles([file]);
    await flushUntil(() => mockToast.mock.calls.length > 0);

    expect(mockToast).toHaveBeenCalledWith("Opened the existing draft for this PDF.", "info");
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-existing/edit");
  });

  it("does not navigate when two PDFs are dropped; shows two Open links", async () => {
    mockUploadFile
      .mockResolvedValueOnce({ public_id: "att-a" })
      .mockResolvedValueOnce({ public_id: "att-b" });
    mockPost
      .mockResolvedValueOnce({
        bill_public_id: "bill-a",
        existing: false,
        existing_reason: null,
        read_status: "ok",
      })
      .mockResolvedValueOnce({
        bill_public_id: "bill-b",
        existing: false,
        existing_reason: null,
        read_status: "ok",
      });

    const f1 = new File(["a"], "a.pdf", { type: "application/pdf" });
    const f2 = new File(["b"], "b.pdf", { type: "application/pdf" });
    await dropFiles([f1, f2]);
    await flushUntil(() => mockPost.mock.calls.length >= 2);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(openLinks().length).toBe(2);
    expect(mockReload.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("stable row ids: remove errored a while b uploads; b done with Open; c ok", async () => {
    mockUploadFile.mockImplementation(async (_path, file: File) => {
      if (file.name === "b.pdf") {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (file.name === "a.pdf") {
        throw new ApiError(500, "driver");
      }
      return { public_id: `att-${file.name}` };
    });
    mockPost.mockImplementation(async (_path, body: { attachment_public_id: string }) => ({
      bill_public_id: body.attachment_public_id.replace("att-", "bill-"),
      existing: false,
      existing_reason: null,
      read_status: "ok",
    }));

    const fa = new File(["a"], "a.pdf", { type: "application/pdf" });
    const fb = new File(["b"], "b.pdf", { type: "application/pdf" });
    const fc = new File(["c"], "c.pdf", { type: "application/pdf" });
    await dropFiles([fa, fb, fc]);
    await flushUntil(() => container.textContent?.includes("Error"));
    await act(async () => {
      removeButtonForFile("a.pdf")?.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    await flushQueueIdle();

    expect(openLinks().length).toBe(2);
    expect(container.textContent).toContain("b.pdf");
    expect(container.textContent).toContain("c.pdf");
    expect(container.textContent).not.toMatch(/bill-a\.pdf/);
  });

  it("rejects non-PDF with inline message", async () => {
    const file = new File(["x"], "note.txt", { type: "text/plain" });
    await dropFiles([file]);
    await flushUntil(() => container.textContent?.includes("Only PDF files"));

    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Only PDF files can become draft bills here.");
  });

  it("shows row error on API failure and 404 copy", async () => {
    mockPost.mockRejectedValueOnce(new ApiError(404, "missing"));
    const file = new File(["pdf"], "bad.pdf", { type: "application/pdf" });
    await dropFiles([file]);
    await flushUntil(() => container.textContent?.includes("can't be read"));

    expect(container.textContent).toContain("This file can't be read here.");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows fixed copy for 500, never server detail in the row", async () => {
    mockPost.mockRejectedValueOnce(new ApiError(500, "ODBC Driver 18 for SQL Server"));
    const file = new File(["pdf"], "bad.pdf", { type: "application/pdf" });
    await dropFiles([file]);
    await flushUntil(() => container.textContent?.includes("Couldn't create"));
    expect(container.textContent).toContain("Couldn't create a draft from this file.");
    expect(container.textContent).not.toContain("ODBC");
  });

  it("processes immediate upload failures once each and terminates", async () => {
    mockUploadFile.mockRejectedValue(new OfflineError());
    const f1 = new File(["a"], "a.pdf", { type: "application/pdf" });
    const f2 = new File(["b"], "b.pdf", { type: "application/pdf" });
    await dropFiles([f1, f2]);
    await flushQueueIdle();
    expect(mockUploadFile).toHaveBeenCalledTimes(2);
    expect(mockPost).not.toHaveBeenCalled();
    expect(container.textContent?.match(/You're offline/g)?.length).toBe(2);
  });

  it("re-drop same PDF shows Already added note", async () => {
    const file = new File(["pdf"], "same.pdf", { type: "application/pdf" });
    await mountList();
    await enqueueViaInput([file]);
    await flushUntil(() => mockPost.mock.calls.length >= 1);
    await enqueueViaInput([file]);
    await flushUntil(() => container.textContent?.includes("Already added"));
    expect(container.textContent).toContain("Already added: same.pdf");
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
  });

  it("does not navigate after unmount during upload", async () => {
    mockUploadFile.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ public_id: "att-late" }), 100)),
    );
    const file = new File(["pdf"], "solo.pdf", { type: "application/pdf" });
    await dropFiles([file]);
    await flushUntil(() => container.textContent?.includes("Uploading"));
    act(() => {
      root.unmount();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("second solo drop while busy: both processed; only second solo navigates", async () => {
    mockUploadFile.mockImplementation(async (_path, file: File) => {
      if (file.name === "first.pdf") {
        await new Promise((r) => setTimeout(r, 80));
      }
      return { public_id: `att-${file.name}` };
    });
    mockPost.mockImplementation(async (_path, body: { attachment_public_id: string }) => ({
      bill_public_id: body.attachment_public_id.replace("att-", ""),
      existing: false,
      existing_reason: null,
      read_status: "ok",
    }));

    const first = new File(["a"], "first.pdf", { type: "application/pdf" });
    const second = new File(["b"], "second.pdf", { type: "application/pdf" });
    await mountList();
    await enqueueViaInput([first]);
    await flushUntil(() => container.textContent?.includes("Uploading"));
    await enqueueViaInput([second]);
    await flushQueueIdle();

    expect(mockUploadFile).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/bill/second.pdf/edit");
  });

  it("requires processingRef guard: concurrent processQueue would double-upload", async () => {
    let uploadsInFlight = 0;
    let maxConcurrent = 0;
    mockUploadFile.mockImplementation(async () => {
      uploadsInFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, uploadsInFlight);
      if (uploadsInFlight > 1) {
        throw new Error("concurrent upload");
      }
      await new Promise((r) => setTimeout(r, 30));
      uploadsInFlight -= 1;
      return { public_id: "att-x" };
    });
    const f1 = new File(["a"], "a.pdf", { type: "application/pdf" });
    const f2 = new File(["b"], "b.pdf", { type: "application/pdf" });
    await mountList();
    await enqueueViaInput([f1]);
    await flushUntil(() => container.textContent?.includes("Uploading"));
    await enqueueViaInput([f2]);
    await flushQueueIdle();
    expect(mockUploadFile).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);
    expect(container.textContent).not.toContain("concurrent upload");
    expect(container.textContent?.match(/Error/g)?.length ?? 0).toBe(0);
  });

  it("solo PDF still navigates when a non-PDF is dropped during upload", async () => {
    mockUploadFile.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ public_id: "att-solo" }), 80)),
    );
    const pdf = new File(["pdf"], "solo.pdf", { type: "application/pdf" });
    const png = new File(["x"], "x.png", { type: "image/png" });
    await mountList();
    await enqueueViaInput([pdf]);
    await flushUntil(() => container.textContent?.includes("Uploading"));
    await enqueueViaInput([png]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await flushUntil(() => mockNavigate.mock.calls.length > 0);
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-new/edit");
    expect(container.textContent).toContain("Only PDF files");
  });

  it("Already added notes clear on Clear All and replace on the next drop", async () => {
    const file = new File(["pdf"], "dup.pdf", { type: "application/pdf" });
    const other = new File(["pdf"], "other.pdf", { type: "application/pdf" });
    await mountList();
    await enqueueViaInput([file]);
    await flushUntil(() => mockPost.mock.calls.length >= 1);
    await enqueueViaInput([file, other]);
    await flushUntil(() => container.textContent?.includes("Already added: dup.pdf"));
    expect(container.textContent?.match(/Already added: dup\.pdf/g)?.length).toBe(1);
    await enqueueViaInput([file]);
    await flushUntil(() => container.textContent?.includes("Already added"));
    expect(container.textContent?.match(/Already added:/g)?.length).toBe(1);
    const clearBtn = container.querySelector(".pending-files-header button") as HTMLButtonElement;
    await act(async () => {
      clearBtn.click();
    });
    expect(container.textContent).not.toContain("Already added");
  });

  it("draft bill card navigates to edit; completed to view", async () => {
    mockListState.items = [
      {
        public_id: "draft-1",
        vendor_id: 1,
        project_id: 1,
        bill_number: "D-1",
        bill_date: "2026-01-01",
        total_amount: "10",
        status: "draft",
        is_draft: true,
        review_status: null,
      },
      {
        public_id: "done-1",
        vendor_id: 1,
        project_id: 1,
        bill_number: "X-1",
        bill_date: "2026-01-01",
        total_amount: "20",
        status: "completed",
        is_draft: false,
        review_status: null,
      },
    ];
    await renderList();
    await flushUntil(() => container.querySelectorAll(".entry-card").length >= 2);
    const cards = Array.from(container.querySelectorAll(".entry-card"));
    await act(async () => {
      (cards[0] as HTMLElement).click();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/bill/draft-1/edit");
    await act(async () => {
      (cards[1] as HTMLElement).click();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/bill/done-1");
  });

  it("processes files sequentially", async () => {
    const order: string[] = [];
    mockUploadFile.mockImplementation(async (_path, file: File) => {
      order.push(`up-${file.name}`);
      return { public_id: `att-${file.name}` };
    });
    mockPost.mockImplementation(async (_path, body: { attachment_public_id: string }) => {
      order.push(`post-${body.attachment_public_id}`);
      return {
        bill_public_id: body.attachment_public_id,
        existing: false,
        existing_reason: null,
        read_status: "ok",
      };
    });

    const f1 = new File(["a"], "first.pdf", { type: "application/pdf" });
    const f2 = new File(["b"], "second.pdf", { type: "application/pdf" });
    await dropFiles([f1, f2]);
    await flushUntil(() => mockPost.mock.calls.length >= 2);

    expect(order).toEqual([
      "up-first.pdf",
      "post-att-first.pdf",
      "up-second.pdf",
      "post-att-second.pdf",
    ]);
  });
});

describe("BillList search debounce (U-700)", () => {
  it("debounces search input (~300ms) before updating the list query", async () => {
    await mountList();
    const search = container.querySelector('input[aria-label="Search bills by vendor, bill number or memo"]') as HTMLInputElement;
    expect(search).toBeTruthy();

    await act(async () => {
      setInputValue(search, "a");
      setInputValue(search, "ab");
      setInputValue(search, "abc");
    });
    expect(mockSetSearch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(mockSetSearch).toHaveBeenCalledTimes(1);
    expect(mockSetSearch).toHaveBeenCalledWith("abc");
  });
});
