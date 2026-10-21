import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BillEdit from "./BillEdit";
import { ApiError } from "../../api/client";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue } from "../../__testutils__/domEvents";
import type { Bill, BillLineItem, ReadAttachmentResult } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BILL_GET_PATH = "/api/v1/get/bill/bill-1";
const BILL_LINE_ITEMS_PATH = "/api/v1/get/bill_line_items/bill/1";
const ATT_ID = 501;

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();
const mockToast = vi.fn();
const mockNavigate = vi.fn();
const mockRereadBillAttachment = vi.fn();
const mockSuggestCoding = vi.fn();
const billPermFlags = vi.hoisted(() => ({ canUpdate: true }));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return { ...mod, useNavigate: () => mockNavigate };
});

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
  ApiError: class ApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  },
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

vi.mock("../../components/ReviewTimeline", () => ({ default: vi.fn(() => null) }));
vi.mock("../../components/LineItemAttachment", () => ({ default: () => null }));

vi.mock("../../hooks/useViewAttachmentObjectUrl", () => ({
  useViewAttachmentObjectUrl: () => ({
    objectUrl: "blob:test",
    loading: false,
    loadError: null,
  }),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: {
      is_admin: false,
      modules: billPermFlags.canUpdate
        ? [
            {
              name: "Bills",
              can_read: true,
              can_update: true,
              can_create: true,
              can_delete: false,
              can_complete: false,
              can_submit: false,
              can_approve: false,
            },
          ]
        : [
            {
              name: "Bills",
              can_read: true,
              can_update: false,
              can_create: false,
              can_delete: false,
              can_complete: false,
              can_submit: false,
              can_approve: false,
            },
          ],
      auth: { public_id: "a", username: "u" },
      user: { id: 1, public_id: "u", firstname: "Test", lastname: "User" },
      role: null,
      accessible_project_ids: [],
    },
    isLoading: false,
  }),
}));

vi.mock("./codingSuggestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./codingSuggestion")>();
  return { ...actual, suggestCoding: (...args: unknown[]) => mockSuggestCoding(...args) };
});

vi.mock("./readAttachment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./readAttachment")>();
  return {
    ...actual,
    rereadBillAttachment: (...args: unknown[]) => mockRereadBillAttachment(...args),
  };
});

let captureSetLines:
  | ((updater: (prev: Record<string, unknown>[]) => Record<string, unknown>[]) => void)
  | undefined;
vi.mock("./useBillCodingSuggestion", () => ({
  useBillCodingSuggestion: (opts: {
    setLines: (updater: (prev: Record<string, unknown>[]) => Record<string, unknown>[]) => void;
  }) => {
    captureSetLines = opts.setLines;
    return { budgetChip: null };
  },
}));

const VISIBLE_PROJECT = { id: 7, public_id: "p-visible", name: "Visible Project" };

function sampleBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 1,
    public_id: "bill-1",
    row_version: "brv-1",
    created_datetime: null,
    modified_datetime: null,
    vendor_id: 1,
    payment_term_id: 1,
    bill_date: "2026-01-15",
    due_date: "2026-02-15",
    bill_number: "B-100",
    total_amount: "100.00",
    memo: "",
    is_draft: true,
    status: "draft",
    intake_source: null,
    intake_source_detail: null,
    ...overrides,
  };
}

function sampleLineItem(overrides: Partial<BillLineItem> = {}): BillLineItem {
  return {
    id: 11,
    public_id: "li-1",
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    bill_id: 1,
    sub_cost_code_id: null,
    project_id: 1,
    description: "",
    quantity: null,
    rate: "",
    amount: "",
    is_billable: true,
    is_billed: null,
    markup: null,
    price: null,
    is_draft: true,
    ...overrides,
  };
}

function setupMocks(opts: {
  bill?: Partial<Bill>;
  lineItems?: BillLineItem[];
  withAttachment?: boolean;
}) {
  const {
    bill = {},
    lineItems = [sampleLineItem()],
    withAttachment = true,
  } = opts;

  mockGetOne.mockImplementation((path: string) => {
    if (path === BILL_GET_PATH) return Promise.resolve(sampleBill(bill));
    if (path === "/api/v1/bill/bill-1/intake-prediction") {
      return Promise.reject(new ApiError(404, "Not found"));
    }
    if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
      if (!withAttachment) return Promise.reject(new ApiError(404, "Not found"));
      return Promise.resolve({ public_id: "blia-1", attachment_id: ATT_ID });
    }
    if (path === `/api/v1/get/attachment/id/${ATT_ID}`) {
      return Promise.resolve({ public_id: "att-pub-1" });
    }
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  mockGetList.mockImplementation((path: string) => {
    if (path === "/api/v1/get/vendors") {
      return Promise.resolve({
        data: [
          { id: 1, public_id: "v-1", name: "V1" },
          { id: 2, public_id: "v-2", name: "V2" },
        ],
        count: 2,
      });
    }
    if (path === "/api/v1/get/payment-terms") {
      return Promise.resolve({ data: [{ id: 1, public_id: "pt-1", name: "Net 30" }], count: 1 });
    }
    if (path === "/api/v1/get/sub-cost-codes") {
      return Promise.resolve({
        data: [{ id: 10, public_id: "scc-pub", name: "SCC", number: "01" }],
        count: 1,
      });
    }
    if (path === "/api/v1/get/projects") {
      return Promise.resolve({ data: [VISIBLE_PROJECT], count: 1 });
    }
    if (path === BILL_LINE_ITEMS_PATH) {
      return Promise.resolve({ data: lineItems, count: lineItems.length });
    }
    return Promise.reject(new Error(`unexpected getList: ${path}`));
  });

  mockPut.mockImplementation((path: string, body?: unknown) => {
    if (path === "/api/v1/update/bill/bill-1") {
      return Promise.resolve(sampleBill({ row_version: "brv-2", ...(body as object) }));
    }
    if (path.startsWith("/api/v1/update/bill_line_item/")) {
      return Promise.resolve({
        ...sampleLineItem(),
        row_version: "rv-2",
        ...(body as object),
      });
    }
    return Promise.reject(new Error(`unexpected put: ${path}`));
  });
  mockPost.mockRejectedValue(new Error("unexpected post"));
  mockDel.mockResolvedValue({});
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let confirmSpy: ReturnType<typeof vi.spyOn>;

async function renderAndSettle() {
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/bill/bill-1/edit"] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/bill/:publicId/edit",
              element: createElement(BillEdit),
            }),
          ),
        ),
      ),
    );
  });
  await flushUntil(() => container.querySelector('button[type="submit"]') != null);
  expect(container.querySelector('button[type="submit"]')).not.toBeNull();
}

function rereadPdfButton(): HTMLButtonElement | null {
  return (
    (Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Re-read PDF" || b.textContent === "Reading…",
    ) as HTMLButtonElement | undefined) ?? null
  );
}

function emptyReadFields(): ReadAttachmentResult["fields"] {
  return {
    vendor: { value: null, extracted_name: null, confidence: null },
    bill_number: { value: null, confidence: null },
    bill_date: { value: null, confidence: null },
    total_amount: { value: null, confidence: null },
    description: { value: null, confidence: null },
    long_description: { value: null, confidence: null },
    reference: { value: null, confidence: null },
  };
}

function okRead(overrides: Partial<ReadAttachmentResult["fields"]> = {}): ReadAttachmentResult {
  return {
    status: "ok",
    message: null,
    fields: { ...emptyReadFields(), ...overrides },
    coding: null,
    model: null,
  };
}

describe("BillEdit Re-read PDF (U-704)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captureSetLines = undefined;
    billPermFlags.canUpdate = true;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockToast.mockReset();
    mockRereadBillAttachment.mockReset();
    mockNavigate.mockReset();
    mockSuggestCoding.mockReset();
    mockSuggestCoding.mockResolvedValue(null);
    mockPut.mockReset();
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("shows Re-read PDF for draft bills with an attachment", async () => {
    setupMocks({ withAttachment: true });
    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");
    expect(rereadPdfButton()?.textContent).toBe("Re-read PDF");
  });

  it("hides Re-read PDF when lifecycle status is not draft (in_review + is_draft true)", async () => {
    setupMocks({
      bill: { status: "in_review", is_draft: true },
      withAttachment: true,
    });
    await renderAndSettle();
    await flushUntil(() => container.querySelector('button[type="submit"]') != null);
    expect(rereadPdfButton()).toBeNull();
  });

  it("hides Re-read PDF when the bill is finalized", async () => {
    setupMocks({ bill: { is_draft: false, status: "completed" }, withAttachment: true });
    await renderAndSettle();
    await flushUntil(() => container.querySelector('button[type="submit"]') != null);
    expect(rereadPdfButton()).toBeNull();
  });

  it("hides Re-read PDF when there is no attachment", async () => {
    setupMocks({ withAttachment: false });
    await renderAndSettle();
    await flushUntil(() => container.querySelector('button[type="submit"]') != null);
    expect(rereadPdfButton()).toBeNull();
  });

  it("does not render Re-read when the user lacks Bills can_update (PUT /update/bill)", async () => {
    billPermFlags.canUpdate = false;
    setupMocks({ withAttachment: true });
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/bill/bill-1/edit"] },
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: "/bill/:publicId/edit",
                element: createElement(BillEdit),
              }),
            ),
          ),
        ),
      );
    });
    await flushUntil(
      () => container.textContent?.includes("don't have permission to edit") ?? false,
    );
    expect(container.textContent).toContain("don't have permission to edit");
    expect(rereadPdfButton()).toBeNull();
  });

  it("cancel on confirm does not save", async () => {
    setupMocks({});
    confirmSpy.mockReturnValue(false);
    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockRereadBillAttachment).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
    const billNumberInput = container.querySelector(
      'input[name="bill_number"]',
    ) as HTMLInputElement;
    expect(billNumberInput.value).toBe("B-100");
  });

  it("replaces populated fields when read returned values and saves via saveAll", async () => {
    setupMocks({
      bill: { bill_number: "KEEP-1", vendor_id: 1 },
      lineItems: [sampleLineItem({ rate: "10.00" })],
    });
    mockRereadBillAttachment.mockResolvedValue(
      okRead({
        bill_number: { value: "NEW-9", confidence: "0.9" },
        bill_date: { value: "2026-04-01", confidence: "0.9" },
        total_amount: { value: "42.00", confidence: "0.9" },
      }),
    );

    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Replace this draft's vendor, bill number, date, memo, amount, description and coding with what the PDF says?",
    );
    const billPuts = mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1");
    expect(billPuts).toHaveLength(1);
    const billPut = billPuts[0];
    expect(billPut?.[1]).toMatchObject({
      bill_number: "NEW-9",
      bill_date: "2026-04-01",
      due_date: "2026-04-01",
    });
    const linePut = mockPut.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/v1/update/bill_line_item/"),
    );
    expect(linePut?.[1]).toMatchObject({ rate: 42 });
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining("Replaced"),
      "success",
    );
  });

  it("keeps fields the read left empty", async () => {
    setupMocks({ bill: { bill_number: "KEEP-1" } });
    mockRereadBillAttachment.mockResolvedValue(
      okRead({ bill_date: { value: "2026-04-01", confidence: "0.9" } }),
    );
    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => mockPut.mock.calls.length > 0);

    const billPuts = mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1");
    expect(billPuts[billPuts.length - 1]?.[1]).toMatchObject({
      bill_number: "KEEP-1",
      bill_date: "2026-04-01",
    });
  });

  it("multi-line bill replaces header only and toast mentions unchanged lines", async () => {
    setupMocks({
      lineItems: [
        sampleLineItem({ public_id: "li-1", rate: "10.00" }),
        sampleLineItem({ public_id: "li-2", id: 12, rate: "20.00" }),
      ],
    });
    mockRereadBillAttachment.mockResolvedValue(
      okRead({
        bill_number: { value: "HDR-ONLY", confidence: "0.9" },
        total_amount: { value: "999.00", confidence: "0.9" },
      }),
    );
    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => mockToast.mock.calls.some((c) => c[1] === "success"));

    const linePuts = mockPut.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/v1/update/bill_line_item/"),
    );
    for (const call of linePuts) {
      expect(call[1]).not.toMatchObject({ rate: 999 });
    }
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining("Line items were left unchanged"),
      "success",
    );
  });

  it("does not write memo boilerplate when read has no memo content", async () => {
    setupMocks({ bill: { memo: "Existing memo" } });
    mockRereadBillAttachment.mockResolvedValue(
      okRead({ bill_number: { value: "N-1", confidence: "0.9" } }),
    );
    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => mockPut.mock.calls.length > 0);

    const billPuts = mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1");
    expect(billPuts[billPuts.length - 1]?.[1]).toMatchObject({ memo: "Existing memo" });
  });

  it("writes memo from long_description only when present", async () => {
    setupMocks({ bill: { memo: "" } });
    mockRereadBillAttachment.mockResolvedValue(
      okRead({
        bill_number: { value: "N-1", confidence: "0.9" },
        long_description: { value: "Tail from PDF", confidence: "0.5" },
      }),
    );
    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => mockPut.mock.calls.length > 0);

    const billPuts = mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1");
    const billPut = billPuts[billPuts.length - 1];
    expect(billPut?.[1]).toMatchObject({ memo: "Tail from PDF" });
    expect(String(billPut?.[1]?.memo)).not.toContain("via PDF");
  });

  it("ai_unavailable with populated read fields changes nothing and does not save", async () => {
    setupMocks({});
    mockRereadBillAttachment.mockResolvedValue({
      status: "ai_unavailable",
      message: "AI suggestions are paused for today",
      fields: {
        ...emptyReadFields(),
        bill_number: { value: "SHOULD-NOT-APPLY", confidence: "0.9" },
      },
      coding: null,
      model: null,
    } satisfies ReadAttachmentResult);

    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => mockToast.mock.calls.length > 0);
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    expect(mockToast).toHaveBeenCalledWith("AI suggestions are paused for today", "info");
    expect(mockPut).not.toHaveBeenCalled();
    expect(
      (container.querySelector('input[name="bill_number"]') as HTMLInputElement).value,
    ).toBe("B-100");
    const fieldset = container.querySelector("fieldset");
    expect(fieldset?.hasAttribute("disabled")).toBe(false);
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("flushes a typed header edit before re-read when read returns ai_unavailable", async () => {
    setupMocks({});
    mockRereadBillAttachment.mockResolvedValue({
      status: "ai_unavailable",
      message: "AI suggestions are paused for today",
      fields: emptyReadFields(),
      coding: null,
      model: null,
    } satisfies ReadAttachmentResult);

    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    const billNumberInput = container.querySelector(
      'input[name="bill_number"]',
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(billNumberInput, "TYPED-BEFORE-REREAD");
    });

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"));

    const billPuts = mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1");
    expect(billPuts).toHaveLength(1);
    expect(billPuts[0]?.[1]).toMatchObject({ bill_number: "TYPED-BEFORE-REREAD" });
    expect(billNumberInput.value).toBe("TYPED-BEFORE-REREAD");
  });

  it("surfaces API errors as error toasts", async () => {
    setupMocks({});
    mockRereadBillAttachment.mockRejectedValue(new ApiError(409, "Not a draft"));

    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => mockToast.mock.calls.length > 0);
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    expect(mockToast).toHaveBeenCalledWith(
      "Re-read PDF is only available for draft bills.",
      "error",
    );
    expect(mockPut).not.toHaveBeenCalled();
    const fieldset = container.querySelector("fieldset");
    expect(fieldset?.hasAttribute("disabled")).toBe(false);
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("keeps the current vendor when the read vendor is not in lookups", async () => {
    setupMocks({ bill: { bill_number: "KEEP-V" } });
    mockRereadBillAttachment.mockResolvedValue(
      okRead({
        vendor: {
          value: { public_id: "v-unknown", name: "Unknown Co" },
          extracted_name: "Unknown Co",
          confidence: "0.9",
        },
        bill_number: { value: "VENDOR-TEST", confidence: "0.9" },
      }),
    );
    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"));

    const billPuts = mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1");
    expect(billPuts[billPuts.length - 1]?.[1]).toMatchObject({
      vendor_public_id: "v-1",
      bill_number: "VENDOR-TEST",
    });
  });

  it("uses line items updated during an in-flight re-read when saving", async () => {
    setupMocks({});
    let resolveRead!: (v: ReadAttachmentResult) => void;
    mockRereadBillAttachment.mockImplementation(
      () =>
        new Promise<ReadAttachmentResult>((resolve) => {
          resolveRead = resolve;
        }),
    );

    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => rereadPdfButton()?.textContent === "Reading…");

    expect(captureSetLines).toBeDefined();
    await act(async () => {
      captureSetLines!((prev) =>
        prev.map((li) => ({
          ...li,
          description: "IN-FLIGHT-SUGGESTION",
        })),
      );
    });

    await act(async () => {
      resolveRead(
        okRead({
          bill_number: { value: "SAVED-AFTER-SUGGEST", confidence: "0.9" },
        }),
      );
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"));

    const linePut = mockPut.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/v1/update/bill_line_item/"),
    );
    expect(linePut?.[1]).toMatchObject({ description: "IN-FLIGHT-SUGGESTION" });
    const billPuts = mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1");
    expect(billPuts[billPuts.length - 1]?.[1]).toMatchObject({ bill_number: "SAVED-AFTER-SUGGEST" });
  });

  it("does not save after unmount when an in-flight re-read resolves", async () => {
    setupMocks({});
    let resolveRead!: (v: ReadAttachmentResult) => void;
    mockRereadBillAttachment.mockImplementation(
      () =>
        new Promise<ReadAttachmentResult>((resolve) => {
          resolveRead = resolve;
        }),
    );

    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => rereadPdfButton()?.textContent === "Reading…");

    await act(async () => {
      root.unmount();
      resolveRead(okRead({ bill_number: { value: "GHOST", confidence: "0.9" } }));
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(mockPut).not.toHaveBeenCalled();
  });

  it("cancel on confirm after typing a header field still debounce-PUTs the typed value", async () => {
    setupMocks({});
    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    const billNumberInput = container.querySelector(
      'input[name="bill_number"]',
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(billNumberInput, "TYPED-THEN-CANCEL-REREAD");
    });

    confirmSpy.mockReturnValueOnce(false);
    await act(async () => {
      rereadPdfButton()?.click();
    });
    expect(mockRereadBillAttachment).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"));

    const billPuts = mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1");
    expect(billPuts).toHaveLength(1);
    expect(billPuts[0]?.[1]).toMatchObject({ bill_number: "TYPED-THEN-CANCEL-REREAD" });
  });

  it("two rapid Re-read clicks with confirm true invoke rereadBillAttachment once", async () => {
    setupMocks({});
    let resolveRead!: (v: ReadAttachmentResult) => void;
    mockRereadBillAttachment.mockImplementation(
      () =>
        new Promise<ReadAttachmentResult>((resolve) => {
          resolveRead = resolve;
        }),
    );

    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    const btn = rereadPdfButton()!;
    await act(async () => {
      btn.click();
      btn.click();
    });
    await flushUntil(() => mockRereadBillAttachment.mock.calls.length === 1);

    expect(mockRereadBillAttachment).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRead(okRead({ bill_number: { value: "ONCE", confidence: "0.9" } }));
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"));
  });

  it("locks the form and Save while a re-read is in flight", async () => {
    setupMocks({});
    let resolveRead!: (v: ReadAttachmentResult) => void;
    mockRereadBillAttachment.mockImplementation(
      () =>
        new Promise<ReadAttachmentResult>((resolve) => {
          resolveRead = resolve;
        }),
    );

    await renderAndSettle();
    await flushUntil(() => rereadPdfButton()?.textContent === "Re-read PDF");

    await act(async () => {
      rereadPdfButton()?.click();
    });
    await flushUntil(() => rereadPdfButton()?.textContent === "Reading…");

    const fieldset = container.querySelector("fieldset");
    expect(fieldset?.hasAttribute("disabled")).toBe(true);
    const saveBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    await act(async () => {
      resolveRead(okRead({ bill_number: { value: "FROM-PDF", confidence: "0.9" } }));
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"));

    const billPuts = mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1");
    expect(billPuts[billPuts.length - 1]?.[1]).toMatchObject({ bill_number: "FROM-PDF" });
    await flushUntil(
      () =>
        (container.querySelector('input[name="bill_number"]') as HTMLInputElement).value ===
        "FROM-PDF",
    );
  });
});
