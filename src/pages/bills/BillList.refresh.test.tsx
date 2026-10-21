/**
 * U-705: BillList keeps chrome visible on list refresh; import batch coalesces reload().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { flushUntil } from "../../__testutils__/flush";
import { ApiError } from "../../api/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = vi.fn();
const mockUploadFile = vi.fn();
const mockPost = vi.fn();
const mockRawRequest = vi.fn();
const requestedUrls: string[] = [];

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return { ...mod, useNavigate: () => mockNavigate };
});

vi.mock("../../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../api/client")>();
  return {
    ...mod,
    rawRequest: (url: string) => {
      requestedUrls.push(url);
      return mockRawRequest(url);
    },
    uploadFile: (...args: unknown[]) => mockUploadFile(...args),
    post: (...args: unknown[]) => mockPost(...args),
  };
});

vi.mock("../../hooks/useIdNameMap", () => ({
  useIdNameMap: () => new Map<number, string>(),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const seedBill = {
  public_id: "seed-bill",
  vendor_id: 1,
  project_id: 1,
  bill_number: "S-1",
  bill_date: "2026-01-01",
  total_amount: "10",
  status: "draft",
  is_draft: true,
  review_status: null,
};

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let listResolve: ((v: unknown) => void) | undefined;
let listPending: Promise<unknown> | undefined;

function billsListUrl(url: string): boolean {
  return url.includes("/api/v1/get/bills");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  vi.clearAllMocks();
  requestedUrls.length = 0;
  sessionStorage.clear();
  listResolve = undefined;
  listPending = undefined;

  mockRawRequest.mockImplementation((url: string) => {
    if (!billsListUrl(url)) {
      return Promise.resolve({ data: [], count: 0, page: 1, page_size: 50 });
    }
    if (listPending) return listPending;
    return Promise.resolve({
      data: [seedBill],
      count: 1,
      page: 1,
      page_size: 50,
    });
  });

  mockUploadFile.mockImplementation(async (_path, file: File) => {
    await new Promise((r) => setTimeout(r, 10));
    return { public_id: `att-${file.name}` };
  });
  mockPost.mockImplementation(async (_path, body: { attachment_public_id: string }) => {
    await new Promise((r) => setTimeout(r, 10));
    return {
      bill_public_id: body.attachment_public_id.replace("att-", "bill-"),
      existing: false,
      existing_reason: null,
      read_status: "ok",
    };
  });

  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
  sessionStorage.clear();
  vi.useRealTimers();
});

async function mountBillList() {
  const { default: BillList } = await import("./BillList");
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, { initialEntries: ["/bill/list"] }, createElement(BillList)),
      ),
    );
  });
}

async function mountWhenListIdle() {
  await mountBillList();
  await flushUntil(() => container.querySelector(".drop-zone") !== null);
  await flushUntil(() => container.querySelectorAll(".entry-card").length >= 1);
}

function billListFetchCount(): number {
  return requestedUrls.filter(billsListUrl).length;
}

async function enqueuePdfs(files: File[]) {
  const input = container.querySelector(".drop-zone input[type='file']") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function flushImportBatch() {
  for (let i = 0; i < 80; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    const busy = container.textContent?.includes("Queued") ||
      container.textContent?.includes("Uploading") ||
      container.textContent?.includes("Reading");
    if (!busy) return;
  }
}

describe("BillList refresh UX (U-705)", () => {
  it("shows full-page loading only on the first load with no rows yet", async () => {
    listPending = new Promise((resolve) => {
      listResolve = resolve;
    });
    mockRawRequest.mockImplementation((url: string) => {
      if (billsListUrl(url)) return listPending!;
      return Promise.resolve({ data: [], count: 0, page: 1, page_size: 50 });
    });

    await mountBillList();
    await flushUntil(() => container.textContent?.includes("Loading..."));
    expect(container.querySelector(".drop-zone")).toBeNull();
    expect(container.querySelector(".pending-files")).toBeNull();

    listResolve!({
      data: [seedBill],
      count: 1,
      page: 1,
      page_size: 50,
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await flushUntil(() => container.querySelector(".drop-zone") !== null);
  });

  it("keeps drop zone, import queue, and rows visible while a list refresh is pending", async () => {
    await mountWhenListIdle();

    let hangNextBillsFetch = true;
    listPending = new Promise((resolve) => {
      listResolve = resolve;
    });
    mockRawRequest.mockImplementation((url: string) => {
      requestedUrls.push(url);
      if (billsListUrl(url)) {
        if (hangNextBillsFetch) {
          hangNextBillsFetch = false;
          return listPending!;
        }
        return Promise.resolve({
          data: [seedBill],
          count: 1,
          page: 1,
          page_size: 50,
        });
      }
      return Promise.resolve({ data: [], count: 0, page: 1, page_size: 50 });
    });

    const refreshBtn = container.querySelector(
      'button[title="Fetch the latest bills from the server"]',
    ) as HTMLButtonElement;
    await act(async () => {
      refreshBtn.click();
    });
    await flushUntil(() => container.textContent?.includes("Refreshing"));

    expect(container.querySelector(".drop-zone")).not.toBeNull();
    expect(container.querySelectorAll(".entry-card").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector(".page-loading")).toBeNull();

    listResolve!({
      data: [seedBill],
      count: 1,
      page: 1,
      page_size: 50,
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await flushUntil(() => !container.textContent?.includes("Refreshing"));
  });

  it("refetches once after a 4-file batch completes", async () => {
    await mountWhenListIdle();
    const before = billListFetchCount();

    const files = ["a.pdf", "b.pdf", "c.pdf", "d.pdf"].map(
      (name) => new File(["x"], name, { type: "application/pdf" }),
    );
    await enqueuePdfs(files);
    await flushImportBatch();

    expect(billListFetchCount() - before).toBe(1);
  });

  it("throttles an in-batch refetch during a long import batch", async () => {
    await mountWhenListIdle();
    const before = billListFetchCount();

    const stepMs = 1200;
    mockUploadFile.mockImplementation(async (_path, file: File) => {
      await new Promise((r) => setTimeout(r, stepMs));
      return { public_id: `att-${file.name}` };
    });
    mockPost.mockImplementation(async (_path, body: { attachment_public_id: string }) => {
      await new Promise((r) => setTimeout(r, stepMs));
      return {
        bill_public_id: body.attachment_public_id.replace("att-", "bill-"),
        existing: false,
        existing_reason: null,
        read_status: "ok",
      };
    });

    const files = ["a.pdf", "b.pdf", "c.pdf", "d.pdf"].map(
      (name) => new File(["x"], name, { type: "application/pdf" }),
    );
    await enqueuePdfs(files);

    // Three files finish by 7200ms; the third completion is past the 5s throttle while a fourth is still queued.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(stepMs * 2 * 3);
    });
    await flushUntil(() => billListFetchCount() - before >= 1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(stepMs * 2);
    });
    await flushImportBatch();
    expect(billListFetchCount() - before).toBe(2);
  });

  it("refetches promptly when a single PDF finishes", async () => {
    await mountWhenListIdle();
    const before = billListFetchCount();

    mockNavigate.mockImplementation(() => {});
    const file = new File(["pdf"], "only.pdf", { type: "application/pdf" });
    await enqueuePdfs([file]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(billListFetchCount() - before).toBe(1);
  });

  it("refetches once after Done then Error within the throttle window", async () => {
    await mountWhenListIdle();
    const before = billListFetchCount();

    mockPost.mockImplementation(async (_path, body: { attachment_public_id: string }) => {
      await new Promise((r) => setTimeout(r, 10));
      if (body.attachment_public_id === "att-b.pdf") {
        throw new ApiError(500, "fail");
      }
      return {
        bill_public_id: body.attachment_public_id.replace("att-", "bill-"),
        existing: false,
        existing_reason: null,
        read_status: "ok",
      };
    });

    const files = ["a.pdf", "b.pdf"].map(
      (name) => new File(["x"], name, { type: "application/pdf" }),
    );
    await enqueuePdfs(files);
    await flushImportBatch();

    expect(billListFetchCount() - before).toBe(1);
  });

  it("does not refetch when every import row errors", async () => {
    await mountWhenListIdle();
    const before = billListFetchCount();

    mockPost.mockRejectedValue(new ApiError(500, "fail"));

    const files = ["a.pdf", "b.pdf"].map(
      (name) => new File(["x"], name, { type: "application/pdf" }),
    );
    await enqueuePdfs(files);
    await flushImportBatch();

    expect(billListFetchCount() - before).toBe(0);
  });

  it("refetches at least once during a long batch fed by drops every 3s", async () => {
    await mountWhenListIdle();
    const before = billListFetchCount();

    const stepMs = 2500;
    mockUploadFile.mockImplementation(async (_path, file: File) => {
      await new Promise((r) => setTimeout(r, stepMs));
      return { public_id: `att-${file.name}` };
    });
    mockPost.mockImplementation(async (_path, body: { attachment_public_id: string }) => {
      await new Promise((r) => setTimeout(r, stepMs));
      return {
        bill_public_id: body.attachment_public_id.replace("att-", "bill-"),
        existing: false,
        existing_reason: null,
        read_status: "ok",
      };
    });

    const queueBusy = () =>
      container.textContent?.includes("Queued") ||
      container.textContent?.includes("Uploading") ||
      container.textContent?.includes("Reading");

    let sawInBatchRefetch = false;
    await enqueuePdfs([new File(["x"], "drop-0.pdf", { type: "application/pdf" })]);
    for (let tick = 0; tick < 14; tick++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      if (tick === 2) {
        await enqueuePdfs([new File(["x"], "drop-1.pdf", { type: "application/pdf" })]);
      }
      if (tick === 5) {
        await enqueuePdfs([new File(["x"], "drop-2.pdf", { type: "application/pdf" })]);
      }
      if (tick === 8) {
        await enqueuePdfs([new File(["x"], "drop-3.pdf", { type: "application/pdf" })]);
      }
      if (queueBusy() && billListFetchCount() - before >= 1) {
        sawInBatchRefetch = true;
      }
    }
    await flushImportBatch();

    expect(sawInBatchRefetch).toBe(true);
  });

  it("shows an inline error banner on refresh failure while keeping chrome visible", async () => {
    await mountWhenListIdle();

    mockRawRequest.mockImplementation((url: string) => {
      requestedUrls.push(url);
      if (billsListUrl(url)) {
        return Promise.reject(new Error("refresh failed"));
      }
      return Promise.resolve({ data: [], count: 0, page: 1, page_size: 50 });
    });

    const refreshBtn = container.querySelector(
      'button[title="Fetch the latest bills from the server"]',
    ) as HTMLButtonElement;
    await act(async () => {
      refreshBtn.click();
    });
    await flushUntil(() => container.textContent?.includes("refresh failed"));

    expect(container.querySelector(".drop-zone")).not.toBeNull();
    expect(container.querySelectorAll(".entry-card").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("refresh failed");
    expect(container.querySelector(".page")?.querySelector(":scope > .page-error")).not.toBeNull();
  });
});
