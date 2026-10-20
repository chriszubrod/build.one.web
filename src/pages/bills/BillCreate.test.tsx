import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import billEditSource from "./BillEdit.tsx?raw";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BillCreate from "./BillCreate";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue, setSelectValue, setTextareaValue } from "../../__testutils__/domEvents";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockUploadFile = vi.fn();
const mockToast = vi.fn();
const mockSuggestCoding = vi.fn();
const mockReadBillAttachment = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../api/client", () => ({
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
}));

vi.mock("../../hooks/useLookups", () => ({
  useLookups: () =>
    (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups
      ? { data: {}, loading: true }
      : {
          data: {
            vendors: [
              { public_id: "v-1", id: 1, name: "Acme" },
              { public_id: "v-2", id: 2, name: "Other Vendor" },
            ],
            payment_terms: [
              { public_id: "pt-1", id: 1, name: "Due on receipt", due_days: 0 },
              { public_id: "pt-30", id: 2, name: "Net 30", due_days: 30 },
            ],
            projects: [
              { public_id: "p-1", id: 1, name: "Project One", abbreviation: "P1" },
              { public_id: "p-2", id: 2, name: "Project Two", abbreviation: "P2" },
            ],
            sub_cost_codes: [
              { id: 10, public_id: "scc-pub", number: "01-100", name: "SCC Ten" },
              { id: 99, public_id: "scc-user", number: "99-999", name: "User SCC" },
            ],
          },
          loading: false,
        },
}));

vi.mock("./codingSuggestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./codingSuggestion")>();
  return {
    ...actual,
    suggestCoding: (...args: unknown[]) => mockSuggestCoding(...args),
  };
});

vi.mock("./readAttachment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./readAttachment")>();
  return {
    ...actual,
    readBillAttachment: (...args: unknown[]) => mockReadBillAttachment(...args),
  };
});

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

function makeModule(
  name: string,
  perms: Partial<CurrentUserModule> = {},
): CurrentUserModule {
  return {
    public_id: `mod-${name}`,
    name,
    route: null,
    can_create: false,
    can_read: false,
    can_update: false,
    can_delete: false,
    can_submit: false,
    can_approve: false,
    can_complete: false,
    can_view_team: false,
    ...perms,
  };
}

function adminUser(): CurrentUser {
  return {
    is_admin: true,
    modules: [],
    auth: { public_id: "a", username: "admin" },
    user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
    role: null,
    accessible_project_ids: [],
  };
}

const mockUseCurrentUser = vi.fn(() => ({
  data: adminUser(),
  isLoading: false,
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let originalCreateObjectURL: typeof URL.createObjectURL;
let originalRevokeObjectURL: typeof URL.revokeObjectURL;

function stubPost(overrides: Record<string, () => Promise<unknown>> = {}) {
  const defaults: Record<string, () => Promise<unknown>> = {
    "/api/v1/create/bill": async () => ({
      public_id: "bill-1",
      id: 1,
      row_version: "rv-create-1",
    }),
    "/api/v1/create/bill_line_item": async () => ({}),
    "/api/v1/submit/review/bill/bill-1": async () => ({}),
  };
  const handlers = { ...defaults, ...overrides };
  mockPost.mockImplementation(async (path: string) => {
    const handler = handlers[path];
    if (handler) return handler();
    throw new Error(`unexpected post: ${path}`);
  });
}

function renderPage(initialEntries: { pathname: string; state?: unknown }[] = [
  { pathname: "/bill/create" },
]) {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/bill/create", element: createElement(BillCreate) }),
          ),
        ),
      ),
    );
  });
}

function selectChange(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillHeader() {
  const vendorSelect = container.querySelector("#vendor_public_id") as HTMLSelectElement;
  selectChange(vendorSelect, "v-1");
  setInputValue(container.querySelector("#bill_number") as HTMLInputElement, "B-100");
  setInputValue(container.querySelector("#bill_date") as HTMLInputElement, "2026-01-15");
}

function fillLineRow(rowIndex: number, description: string, projectPublicId: string) {
  setInputValue(descriptionInputAt(rowIndex), description);
  const row = container.querySelectorAll("tbody tr")[rowIndex] as HTMLTableRowElement;
  const projectSelect = row.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement;
  selectChange(projectSelect, projectPublicId);
}

/**
 * The Rate cell for a line row. Owns the column index so adding or reordering
 * a column in the line-item table breaks in ONE place instead of silently
 * repointing every rate read/write at the wrong input.
 */
function rateInputAt(rowIndex: number): HTMLInputElement {
  const row = container.querySelectorAll("tbody tr")[rowIndex] as HTMLTableRowElement;
  return row.querySelectorAll("td")[4].querySelector("input") as HTMLInputElement;
}

function fillLineRate(rowIndex: number, rate: string) {
  setInputValue(rateInputAt(rowIndex), rate);
}

/**
 * The Description cell for a line row. Owns the column index for the same
 * reason rateInputAt does — one place to fix when a column moves.
 */
function descriptionInputAt(rowIndex: number): HTMLInputElement {
  const row = container.querySelectorAll("tbody tr")[rowIndex] as HTMLTableRowElement;
  return row.querySelectorAll("td")[0].querySelector("input") as HTMLInputElement;
}

/** The body of the create/bill POST, asserted present. */
function createBillBody(): Record<string, unknown> {
  const call = mockPost.mock.calls.find((c) => c[0] === "/api/v1/create/bill");
  expect(call).toBeTruthy();
  return call![1] as Record<string, unknown>;
}

/** stubPost override making every additional-line POST fail. */
const FAILING_LINE_ITEM = {
  "/api/v1/create/bill_line_item": async () => {
    throw new Error("line item failed");
  },
};

function emptyReadFields() {
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

function disabledReadResult() {
  return {
    status: "disabled" as const,
    message: null,
    fields: emptyReadFields(),
    coding: null,
    model: null,
  };
}

function pdfFile() {
  return new File(["x"], "bill.pdf", { type: "application/pdf" });
}

async function attachPdfViaDrop() {
  await flushUntil(() => container.querySelector(".drop-zone") !== null);
  const zone = container.querySelector(".drop-zone") as HTMLElement;
  const file = pdfFile();
  await act(async () => {
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [file] },
      configurable: true,
    });
    zone.dispatchEvent(drop);
  });
}

async function attachPdf() {
  if (container.querySelector('iframe[title="Bill PDF preview"]')) {
    await act(async () => {
      findButton("Change file").click();
    });
  }
  await flushUntil(() => container.querySelector('input[type="file"]') !== null);
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(fileInput).toBeTruthy();
  const file = pdfFile();
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  await act(async () => {
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
  await flushUntil(() => mockUploadFile.mock.calls.length >= 1);
  await act(async () => {
    await Promise.resolve();
  });
}

function findButton(label: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement;
}

function headerBudgetBadge(): Element | null {
  return container.querySelector(".inline-li-header-actions [class*='coding-budget-']");
}

function lineBudgetBadge(rowIndex: number): Element | null {
  const row = container.querySelectorAll("tbody tr")[rowIndex];
  return row?.querySelector("[class*='coding-budget-']") ?? null;
}

function submitForReviewButton(): HTMLButtonElement {
  return findButton("Submit For Review");
}

function completeBillButton(): HTMLButtonElement {
  return findButton("Complete Bill");
}

/**
 * The SCC cell for a line row. Complete is gated on every populated line
 * having both project and SCC; this owns the column index the same way
 * rateInputAt / descriptionInputAt do.
 */
function sccSelectAt(rowIndex: number): HTMLSelectElement {
  const row = container.querySelectorAll("tbody tr")[rowIndex] as HTMLTableRowElement;
  return row.querySelectorAll("td")[1].querySelector("select") as HTMLSelectElement;
}

function fillLineScc(rowIndex: number, sccId: string) {
  selectChange(sccSelectAt(rowIndex), sccId);
}

function projectSelectValueAt(rowIndex: number): string {
  const row = container.querySelectorAll("tbody tr")[rowIndex] as HTMLTableRowElement;
  return (row.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement).value;
}

function lineProjectForIndex(index: number): string {
  return index % 2 === 0 ? "p-1" : "p-2";
}

async function arrangeMultiLineBillWithRates(rates: string[]) {
  renderPage();

  await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
  expect(container.querySelector("#vendor_public_id")).toBeTruthy();

  await act(async () => {
    fillHeader();
  });

  for (let i = 0; i < rates.length; i++) {
    if (i > 0) {
      await act(async () => {
        findButton("+ Add Line").click();
      });
    }
    await act(async () => {
      fillLineRow(i, `Line ${i + 1}`, lineProjectForIndex(i));
      fillLineRate(i, rates[i]);
    });
  }

  await act(async () => {
    await attachPdf();
  });
}

async function arrangeTwoLineBill() {
  renderPage();

  await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
  expect(container.querySelector("#vendor_public_id")).toBeTruthy();

  await act(async () => {
    fillHeader();
    fillLineRow(0, "Line one", "p-1");
  });

  await act(async () => {
    findButton("+ Add Line").click();
  });

  await act(async () => {
    fillLineRow(1, "Line two", "p-2");
    await attachPdf();
  });
}

async function arrangeOneLineBill(project = "p-1") {
  renderPage();

  await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
  expect(container.querySelector("#vendor_public_id")).toBeTruthy();

  await act(async () => {
    fillHeader();
    fillLineRow(0, "Line one", project);
    await attachPdf();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  delete (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });
  mockUploadFile.mockResolvedValue({ public_id: "att-1", content_type: "application/pdf" });
  mockReadBillAttachment.mockResolvedValue(disabledReadResult());
  mockPut.mockResolvedValue({});
  mockSuggestCoding.mockResolvedValue(null);
  stubPost();

  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = vi.fn(() => "blob:test") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  vi.useRealTimers();
});

describe("BillCreate submit-for-review", () => {
  it("submits for review only after every line item is persisted", async () => {
    let resolveLineItemPost!: () => void;
    const lineItemPostDeferred = new Promise<void>((resolve) => {
      resolveLineItemPost = resolve;
    });

    stubPost({
      "/api/v1/create/bill_line_item": async () => {
        await lineItemPostDeferred;
        return {};
      },
    });

    await arrangeTwoLineBill();

    // Assert propagation BEFORE outcome (U-152).
    const rows = container.querySelectorAll("tbody tr");
    const line2ProjectSelect = rows[1].querySelectorAll("td")[2].querySelector(
      "select",
    ) as HTMLSelectElement;
    expect(line2ProjectSelect.value).toBe("p-2");
    expect(submitForReviewButton().disabled).toBe(false);

    await act(async () => {
      submitForReviewButton().click();
    });

    await flushUntil(
      () =>
        mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill_line_item"),
    );
    expect(
      mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill_line_item"),
    ).toBe(true);
    expect(
      mockPost.mock.calls.some((c) => c[0] === "/api/v1/submit/review/bill/bill-1"),
    ).toBe(false);

    await act(async () => {
      resolveLineItemPost();
    });

    await flushUntil(() => mockNavigate.mock.calls.length > 0);
    expect(mockNavigate.mock.calls.length).toBeGreaterThan(0);

    const createBillCall = mockPost.mock.calls.find(
      (c) => c[0] === "/api/v1/create/bill",
    );
    expect(createBillCall).toBeTruthy();
    expect((createBillCall![1] as Record<string, unknown>).submit_for_review).toBe(false);
    expect((createBillCall![1] as Record<string, unknown>).line_project_public_id).toBe("p-1");

    const lineItemCall = mockPost.mock.calls.find(
      (c) => c[0] === "/api/v1/create/bill_line_item",
    );
    expect(lineItemCall).toBeTruthy();
    expect((lineItemCall![1] as Record<string, unknown>).project_public_id).toBe("p-2");

    const submitCall = mockPost.mock.calls.find(
      (c) => c[0] === "/api/v1/submit/review/bill/bill-1",
    );
    expect(submitCall).toBeTruthy();
    expect(submitCall![1]).toEqual({});

    expect(mockNavigate).toHaveBeenCalledWith("/bill/list");

    // The header total is corrected ONLY on the partial-failure path. The whole
    // point of correct-on-failure (over posting a summary-only total up front
    // and PUTting the real one after) is that the happy path pays for no extra
    // write — so pin that here or the design's only cost-saving is untested.
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("Submit For Review stays disabled until a populated line carries a project", async () => {
    renderPage();

    await flushUntil(() => container.querySelector("tbody tr") !== null);
    expect(container.querySelector("tbody tr")).toBeTruthy();

    await act(async () => {
      await attachPdf();
      fillLineRow(0, "Desc only", "");
    });

    await flushUntil(() => submitForReviewButton()?.disabled === true);
    expect(submitForReviewButton().disabled).toBe(true);

    await act(async () => {
      fillLineRow(0, "Desc only", "p-1");
    });

    await flushUntil(() => !submitForReviewButton().disabled);
    expect(submitForReviewButton().disabled).toBe(false);
  });

  it("a failed line-item POST skips the review submit", async () => {
    stubPost(FAILING_LINE_ITEM);

    await arrangeTwoLineBill();

    await act(async () => {
      submitForReviewButton().click();
    });

    await flushUntil(() => mockToast.mock.calls.length > 0);

    const createBillCall = mockPost.mock.calls.find(
      (c) => c[0] === "/api/v1/create/bill",
    );
    expect(createBillCall).toBeTruthy();
    expect((createBillCall![1] as Record<string, unknown>).submit_for_review).toBe(false);

    expect(
      mockPost.mock.calls.some((c) => String(c[0]).startsWith("/api/v1/submit/review/")),
    ).toBe(false);
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringMatching(/failed to save/i),
      "error",
    );
    expect(mockToast).not.toHaveBeenCalledWith("Submitted for review.");
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-1/edit");
  });

  it("a failed review submit lands the user on the edit page", async () => {
    stubPost({
      "/api/v1/submit/review/bill/bill-1": async () => {
        throw new Error("submit failed");
      },
    });

    await arrangeOneLineBill();

    await act(async () => {
      submitForReviewButton().click();
    });

    await flushUntil(() => mockToast.mock.calls.length > 0);

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringMatching(/Bill saved as draft\.\s*Submit for review failed:/i),
      "error",
    );
    expect(mockToast).not.toHaveBeenCalledWith("Submitted for review.");
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-1/edit");
    // Error path must not take the success destination. That used to be
    // the detail page (`/bill/bill-1`); it is now `/bill/list`. Asserting
    // against the live success path is what makes this spec fail if a
    // follow-up error accidentally navigates like a success.
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/list");
  });

  it.each([
    { missing: "can_update", perms: { can_read: true, can_create: true, can_update: false } },
    { missing: "can_create", perms: { can_read: true, can_create: false, can_update: true } },
  ])(
    "a user without $missing sees Submit For Review disabled even with a project set",
    async ({ perms }) => {
      mockUseCurrentUser.mockReturnValue({
        data: {
          ...adminUser(),
          is_admin: false,
          modules: [makeModule(Modules.BILLS, perms)],
        },
        isLoading: false,
      });

      await arrangeOneLineBill("p-1");

      // Assert propagation BEFORE outcome (U-152).
      const projectSelect = container.querySelectorAll("tbody tr")[0]
        .querySelectorAll("td")[2]
        .querySelector("select") as HTMLSelectElement;
      expect(projectSelect.value).toBe("p-1");

      await flushUntil(() => submitForReviewButton()?.disabled === true);
      expect(submitForReviewButton().disabled).toBe(true);
    },
  );
});

describe("BillCreate partial line failure and submit guard", () => {
  it("corrects the header total when a line item fails to save", async () => {
    stubPost(FAILING_LINE_ITEM);

    await arrangeMultiLineBillWithRates(["100", "50"]);

    expect(rateInputAt(0).value).toBe("100");
    expect(rateInputAt(1).value).toBe("50");

    await act(async () => {
      findButton("Save For Later").click();
    });

    await flushUntil(() => mockPut.mock.calls.length > 0);

    expect(createBillBody().total_amount).toBe(150);

    expect(mockPut).toHaveBeenCalledWith(
      "/api/v1/update/bill/bill-1",
      expect.objectContaining({
        total_amount: 100,
        row_version: "rv-create-1",
      }),
    );
  });

  it("does not correct the header total when the user lacks can_update", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: {
        ...adminUser(),
        is_admin: false,
        modules: [
          makeModule(Modules.BILLS, { can_read: true, can_create: true, can_update: false }),
        ],
      },
      isLoading: false,
    });

    stubPost(FAILING_LINE_ITEM);

    await arrangeMultiLineBillWithRates(["100", "50"]);

    expect(rateInputAt(1).value).toBe("50");

    await act(async () => {
      findButton("Save For Later").click();
    });

    await flushUntil(() => mockToast.mock.calls.length > 0);

    expect(createBillBody().total_amount).toBe(150);

    expect(mockPut).not.toHaveBeenCalled();
    const toastMessage = String(mockToast.mock.calls[0][0]);
    expect(toastMessage).toMatch(/total still includes the unsaved line/i);
  });

  it("still navigates to edit when the header correction itself fails", async () => {
    stubPost(FAILING_LINE_ITEM);
    mockPut.mockRejectedValue(new Error("update failed"));

    await arrangeMultiLineBillWithRates(["100", "50"]);

    expect(rateInputAt(0).value).toBe("100");

    await act(async () => {
      findButton("Save For Later").click();
    });

    await flushUntil(() => mockNavigate.mock.calls.length > 0);

    expect(createBillBody()).toBeTruthy();
    expect(mockPut).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-1/edit");
    expect(mockToast.mock.calls.length).toBeGreaterThan(0);
  });

  it("corrects the header total using only successfully persisted additional lines", async () => {
    let lineItemPostCount = 0;
    stubPost({
      "/api/v1/create/bill_line_item": async () => {
        lineItemPostCount += 1;
        if (lineItemPostCount === 1) return {};
        throw new Error("line item failed");
      },
    });

    await arrangeMultiLineBillWithRates(["100", "50", "25"]);

    expect([0, 1, 2].map((i) => rateInputAt(i).value)).toEqual(["100", "50", "25"]);

    await act(async () => {
      findButton("Save For Later").click();
    });

    await flushUntil(() => mockPut.mock.calls.length > 0);

    expect(createBillBody().total_amount).toBe(175);

    expect(mockPut).toHaveBeenCalledWith(
      "/api/v1/update/bill/bill-1",
      expect.objectContaining({
        total_amount: 150,
        row_version: "rv-create-1",
      }),
    );

    const toastMessage = String(mockToast.mock.calls[0][0]);
    expect(toastMessage).toMatch(/Line 3 failed to save/i);
    expect(toastMessage).not.toMatch(/Line 2 failed/i);
  });

  it("releases the in-flight guard when bill create fails so Save For Later can retry", async () => {
    let createBillCallCount = 0;
    stubPost({
      "/api/v1/create/bill": async () => {
        createBillCallCount += 1;
        if (createBillCallCount === 1) {
          throw new Error("create failed");
        }
        return {
          public_id: "bill-1",
          id: 1,
          row_version: "rv-create-1",
        };
      },
    });

    await arrangeOneLineBill();

    const saveBtn = findButton("Save For Later");
    expect(saveBtn.disabled).toBe(false);

    await act(async () => {
      saveBtn.click();
    });

    await flushUntil(() => container.querySelector(".form-error") !== null);
    expect(container.querySelector(".form-error")?.textContent).toContain("create failed");
    expect(findButton("Save For Later").disabled).toBe(false);

    await act(async () => {
      findButton("Save For Later").click();
    });

    await flushUntil(() => mockNavigate.mock.calls.length > 0);

    expect(mockPost.mock.calls.filter((c) => c[0] === "/api/v1/create/bill")).toHaveLength(2);
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-1/edit");
  });

  it("a double click fires only one create", async () => {
    await arrangeOneLineBill();

    const projectSelect = container.querySelectorAll("tbody tr")[0]
      .querySelectorAll("td")[2]
      .querySelector("select") as HTMLSelectElement;
    expect(projectSelect.value).toBe("p-1");
    expect(findButton("Save For Later").disabled).toBe(false);

    await act(async () => {
      const saveBtn = findButton("Save For Later");
      saveBtn.click();
      saveBtn.click();
    });

    await flushUntil(
      () => mockPost.mock.calls.filter((c) => c[0] === "/api/v1/create/bill").length >= 1,
    );

    expect(mockPost.mock.calls.filter((c) => c[0] === "/api/v1/create/bill")).toHaveLength(1);
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
  });
});

describe("BillCreate line row keys", () => {
  it("keeps the same DOM node and focus on a row after removing an earlier row", async () => {
    renderPage();

    await flushUntil(() => container.querySelector("tbody tr") !== null);
    expect(container.querySelector("tbody tr")).toBeTruthy();

    await act(async () => {
      const addLine = findButton("+ Add Line");
      addLine.click();
      addLine.click();
    });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);

    await act(async () => {
      setInputValue(descriptionInputAt(0), "L1");
      setInputValue(descriptionInputAt(1), "L2");
      setInputValue(descriptionInputAt(2), "L3");
    });

    const row3DescInput = descriptionInputAt(2);
    row3DescInput.focus();

    // Under key={index} React reuses earlier <tr> nodes for the shifted-up rows
    // and unmounts the last one, destroying the node that held "L3" and dropping
    // focus. key={li.uid} keeps each surviving row's DOM identity stable.
    await act(async () => {
      (
        container.querySelector('button[aria-label="Remove line 1"]') as HTMLButtonElement
      ).click();
    });

    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(descriptionInputAt(1).value).toBe("L3");
    expect(descriptionInputAt(1)).toBe(row3DescInput);
    expect(document.activeElement).toBe(row3DescInput);
  });
});

describe("BillCreate due date mirrors bill date", () => {
  it("submits due_date equal to bill_date regardless of payment term due_days", async () => {
    await arrangeOneLineBill();

    await act(async () => {
      selectChange(
        container.querySelector("#payment_term_public_id") as HTMLSelectElement,
        "pt-30",
      );
    });

    // The read-only row shows the bill date itself — never bill_date + due_days.
    expect(container.querySelector("#due_date_display")?.textContent).toBe("2026-01-15");

    await act(async () => {
      findButton("Save For Later").click();
    });

    await flushUntil(
      () => mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill"),
    );

    const body = createBillBody();
    // Pin that the Net-30 term actually landed — otherwise "due_date wasn't
    // shifted by 30 days" would pass for the wrong reason.
    expect(body.payment_term_public_id).toBe("pt-30");
    expect(body.bill_date).toBe("2026-01-15");
    expect(body.due_date).toBe("2026-01-15");
  });
});

describe("BillCreate post-create navigation", () => {
  it("submit success navigates to /bill/list, not the detail page or /edit", async () => {
    await arrangeOneLineBill();

    await act(async () => {
      submitForReviewButton().click();
    });

    await flushUntil(() => mockNavigate.mock.calls.length > 0);
    expect(mockNavigate).toHaveBeenCalledWith("/bill/list");
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/bill-1");
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/bill-1/edit");
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith("Submitted for review.");
  });

  it("complete success navigates to /bill/list and toasts that the bill completed", async () => {
    stubPost({
      "/api/v1/complete/bill/bill-1": async () => ({}),
    });

    await arrangeOneLineBill();
    await act(async () => {
      fillLineScc(0, "10");
    });
    await flushUntil(() => completeBillButton()?.disabled === false);
    expect(completeBillButton().disabled).toBe(false);

    await act(async () => {
      completeBillButton().click();
    });

    await flushUntil(() => mockNavigate.mock.calls.length > 0);
    expect(mockPost).toHaveBeenCalledWith("/api/v1/complete/bill/bill-1", {});
    expect(mockNavigate).toHaveBeenCalledWith("/bill/list");
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/bill-1");
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/bill-1/edit");
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringMatching(/completed/i),
    );
  });

  it("save still navigates to /bill/:id/edit", async () => {
    await arrangeOneLineBill();

    await act(async () => {
      findButton("Save For Later").click();
    });

    await flushUntil(() => mockNavigate.mock.calls.length > 0);
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-1/edit");
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/list");
  });

  it("a failed additional-line POST still navigates to /edit", async () => {
    stubPost(FAILING_LINE_ITEM);

    await arrangeTwoLineBill();

    await act(async () => {
      submitForReviewButton().click();
    });

    await flushUntil(() => mockNavigate.mock.calls.length > 0);
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-1/edit");
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/list");
  });

  it("a failed review follow-up still navigates to /edit", async () => {
    stubPost({
      "/api/v1/submit/review/bill/bill-1": async () => {
        throw new Error("submit failed");
      },
    });

    await arrangeOneLineBill();

    await act(async () => {
      submitForReviewButton().click();
    });

    await flushUntil(() => mockNavigate.mock.calls.length > 0);
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-1/edit");
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/list");
  });
});

function codingSuggestionPayload() {
  return {
    project_public_id: "p-1",
    project_name: "Project One",
    sub_cost_code_public_id: "scc-pub",
    sub_cost_code_number: "01-100",
    sub_cost_code_name: "SCC Ten",
    source: "vendor_history" as const,
    reason: "Recent vendor coding",
    confidence: 0.72,
    model_version: "v1",
    budget_check: null,
    budget_remaining: null,
  };
}

describe("BillCreate coding suggestions", () => {
  it("prefills empty line cells and shows Suggested badge after vendor is set", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillHeader();
    });

    await flushUntil(() =>
      container.querySelector(".status-badge.coding-suggested") !== null,
    );
    expect(sccSelectAt(0).value).toBe("10");
    const row = container.querySelectorAll("tbody tr")[0];
    const projectSelect = row.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement;
    expect(projectSelect.value).toBe("");
    expect(container.textContent).toContain("Suggested 72%");
    expect(mockSuggestCoding).toHaveBeenCalledWith(
      expect.objectContaining({ vendor_public_id: "v-1" }),
    );
  });

  it("r5-1 chip shows once at Bill level for fits response with amount 100.00 from two p-1 lines", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      budget_check: "fits" as const,
      budget_remaining: "500.00",
    });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "60");
      findButton("+ Add Line").click();
    });
    await act(async () => {
      fillLineRow(1, "Line two", "p-1");
      fillLineRate(1, "40");
      fillHeader();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await flushUntil(() => headerBudgetBadge() !== null);
    expect(container.textContent).toContain("Within budget");
    expect(lineBudgetBadge(0)).toBeNull();
    expect(lineBudgetBadge(1)).toBeNull();
    expect(mockSuggestCoding).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "100.00" }),
    );
  });

  it("does not overwrite user-entered sub cost code", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineScc(0, "99");
      selectChange(container.querySelector("#vendor_public_id") as HTMLSelectElement, "v-1");
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(sccSelectAt(0).value).toBe("99");
    const row = container.querySelectorAll("tbody tr")[0];
    const projectSelect = row.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement;
    expect(projectSelect.value).toBe("");
  });

  it("U-676k Save For Later sends coding_prefill_state prefilled while suggestions are untouched", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillHeader();
    });
    await flushUntil(() => sccSelectAt(0).value === "10");
    await act(async () => {
      await attachPdf();
    });

    await act(async () => {
      findButton("Save For Later").click();
    });

    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill"));
    expect(createBillBody().line_coding_prefill_state).toBe("prefilled");
  });

  it("U-676k Submit For Review and Complete stay enabled with unreviewed suggestions", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillHeader();
    });
    await flushUntil(() => sccSelectAt(0).value === "10");
    await act(async () => {
      await attachPdf();
    });

    expect(sccSelectAt(0).value).toBe("10");
    expect(submitForReviewButton().disabled).toBe(false);
    expect(completeBillButton().disabled).toBe(false);
  });

  it("U-676k Submit For Review sends accepted for prefilled lines", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillHeader();
    });
    await flushUntil(() => sccSelectAt(0).value === "10");
    await act(async () => {
      await attachPdf();
    });

    await act(async () => {
      submitForReviewButton().click();
    });

    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill"));
    expect(createBillBody().line_coding_prefill_state).toBe("accepted");
  });

  it("r4-2 project change on prefilled line keeps prefilled state on save", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillHeader();
    });
    await flushUntil(() => sccSelectAt(0).value === "10");
    await act(async () => {
      await attachPdf();
    });

    const row = container.querySelectorAll("tbody tr")[0];
    const projectSelect = row.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement;
    await act(async () => {
      selectChange(projectSelect, "p-2");
    });

    await act(async () => {
      findButton("Save For Later").click();
    });

    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill"));
    expect(createBillBody().line_coding_prefill_state).toBe("prefilled");
    expect(createBillBody().line_project_public_id).toBe("p-2");
  });

  it("r2-P manual SCC with user project becomes changed when user edits SCC before save", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillHeader();
    });
    await flushUntil(() => sccSelectAt(0).value === "10");
    await act(async () => {
      await attachPdf();
    });

    await act(async () => {
      fillLineScc(0, "99");
    });

    await act(async () => {
      findButton("Save For Later").click();
    });

    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill"));
    expect(createBillBody().line_coding_prefill_state).toBe("changed");
    expect(createBillBody().line_sub_cost_code_id).toBe(99);
  });

  it("r1-1 user clear wins when a deferred suggestion response arrives", async () => {
    mockSuggestCoding.mockResolvedValueOnce(codingSuggestionPayload());
    let resolveSecond!: (value: ReturnType<typeof codingSuggestionPayload>) => void;
    mockSuggestCoding.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );

    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      fillHeader();
    });
    await flushUntil(() => sccSelectAt(0).value === "10");

    await act(async () => {
      setTextareaValue(
        container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement,
        "second suggest",
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length >= 2);

    const scc = sccSelectAt(0);
    await act(async () => {
      setSelectValue(scc, "");
    });
    await flushUntil(() => scc.value === "");

    await act(async () => {
      resolveSecond(codingSuggestionPayload());
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(scc.value).toBe("");
  });

  it("r5-2 editing either line amount hides the chip immediately then returns after debounced re-suggest", async () => {
    mockSuggestCoding
      .mockResolvedValueOnce({
        ...codingSuggestionPayload(),
        budget_check: "fits" as const,
        budget_remaining: "1.00",
      })
      .mockResolvedValueOnce({
        ...codingSuggestionPayload(),
        budget_check: "over" as const,
        budget_remaining: "-10.00",
      });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "60");
      findButton("+ Add Line").click();
    });
    await act(async () => {
      fillLineRow(1, "Line two", "p-1");
      fillLineRate(1, "40");
      fillHeader();
    });
    await flushUntil(() => headerBudgetBadge() !== null);

    await act(async () => {
      fillLineRate(0, "70");
    });
    expect(headerBudgetBadge()).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => headerBudgetBadge() !== null);
    expect(mockSuggestCoding.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ amount: "110.00" }),
    );
    expect(headerBudgetBadge()).not.toBeNull();
  });

  it("r5-3 memo edit after chip hides until debounce then re-suggests with same amount", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      budget_check: "fits" as const,
      budget_remaining: "400.00",
    });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "100");
      fillHeader();
    });
    await flushUntil(() => headerBudgetBadge() !== null);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    const callsBefore = mockSuggestCoding.mock.calls.length;
    await act(async () => {
      setTextareaValue(memo, "revised memo");
    });
    expect(headerBudgetBadge()).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length === callsBefore + 1);
    expect(mockSuggestCoding.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ amount: "100.00", memo: "revised memo" }),
    );
    await flushUntil(() => headerBudgetBadge() !== null);
    expect(container.textContent).toContain("Within budget");
  });

  it("r5-4 adding a new empty-SCC p-1 line changes amount and refreshes chip", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      budget_check: "fits" as const,
      budget_remaining: "0",
    });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "60");
      fillHeader();
    });
    await flushUntil(() => headerBudgetBadge() !== null);
    const callsBefore = mockSuggestCoding.mock.calls.length;

    await act(async () => {
      findButton("+ Add Line").click();
    });
    await flushUntil(() => container.querySelectorAll("tbody tr").length >= 2);
    await act(async () => {
      fillLineRow(1, "Line two", "p-1");
      fillLineRate(1, "40");
    });
    expect(headerBudgetBadge()).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length === callsBefore + 1);
    expect(mockSuggestCoding.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ amount: "100.00" }),
    );
    await flushUntil(() => headerBudgetBadge() !== null);
    expect(container.textContent).toContain("Within budget");
  });

  it("r6-1 BillCreate amount then project with 600 ms deferred response shows chip once", async () => {
    let resolveSlow!: (value: ReturnType<typeof codingSuggestionPayload>) => void;
    mockSuggestCoding.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSlow = resolve;
        }),
    );
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRate(0, "100");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(mockSuggestCoding).not.toHaveBeenCalled();

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillHeader();
    });
    expect(mockSuggestCoding).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(headerBudgetBadge()).toBeNull();

    await act(async () => {
      resolveSlow({
        ...codingSuggestionPayload(),
        budget_check: "fits",
        budget_remaining: "50.00",
      } as unknown as ReturnType<typeof codingSuggestionPayload>);
      await Promise.resolve();
    });
    await flushUntil(() => headerBudgetBadge() !== null);
    expect(container.textContent).toContain("Within budget");
    expect(mockSuggestCoding).toHaveBeenCalledTimes(1);
    expect(sccSelectAt(0).value).toBe("10");
  });

  it("r6-2 covered lines netting negative omits amount but still prefills SCC without chip", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      budget_check: "fits" as const,
      budget_remaining: "1.00",
    });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Credit", "p-1");
      fillLineRate(0, "50");
      findButton("+ Add Line").click();
    });
    await act(async () => {
      fillLineRow(1, "Charge", "p-1");
      fillLineRate(1, "-100");
      fillHeader();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length >= 1);
    expect(mockSuggestCoding.mock.calls.at(-1)?.[0].amount).toBeUndefined();
    await flushUntil(() => sccSelectAt(0).value === "10");
    expect(headerBudgetBadge()).toBeNull();
  });

  it("r6-3 SCRATCH-E moved line keeps stale SCC so chip hidden until SCC matches response", async () => {
    mockSuggestCoding
      .mockResolvedValueOnce({
        ...codingSuggestionPayload(),
        sub_cost_code_public_id: "scc-pub",
        budget_check: "fits" as const,
        budget_remaining: "1.00",
      })
      .mockResolvedValueOnce({
        ...codingSuggestionPayload(),
        project_public_id: "p-2",
        sub_cost_code_public_id: "scc-user",
        budget_check: "fits" as const,
        budget_remaining: "2.00",
      });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "100");
      fillHeader();
    });
    await flushUntil(() => sccSelectAt(0).value === "10");
    await flushUntil(() => headerBudgetBadge() !== null);

    const row = container.querySelectorAll("tbody tr")[0];
    const projectSelect = row.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement;
    await act(async () => {
      selectChange(projectSelect, "p-2");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length >= 2);
    expect(sccSelectAt(0).value).toBe("10");
    expect(headerBudgetBadge()).toBeNull();
  });

  it("r6-3 same suggested SCC on moved line shows chip after p-2 response", async () => {
    mockSuggestCoding
      .mockResolvedValueOnce({
        ...codingSuggestionPayload(),
        budget_check: "fits" as const,
        budget_remaining: "1.00",
      })
      .mockResolvedValueOnce({
        ...codingSuggestionPayload(),
        project_public_id: "p-2",
        sub_cost_code_public_id: "scc-pub",
        budget_check: "fits" as const,
        budget_remaining: "2.00",
      });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "100");
      fillHeader();
    });
    await flushUntil(() => sccSelectAt(0).value === "10");

    const row = container.querySelectorAll("tbody tr")[0];
    const projectSelect = row.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement;
    await act(async () => {
      selectChange(projectSelect, "p-2");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => headerBudgetBadge() !== null);
    expect(container.textContent).toContain("Within budget");
  });

  it("r6-4 clearing line 1 project restores p-1 hint and chip for line 0 amount", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      budget_check: "fits" as const,
      budget_remaining: "10.00",
    });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "100");
      fillHeader();
    });
    await flushUntil(() => headerBudgetBadge() !== null);

    await act(async () => {
      findButton("+ Add Line").click();
    });
    await flushUntil(() => container.querySelectorAll("tbody tr").length >= 2);

    const row1 = container.querySelectorAll("tbody tr")[1];
    const projectSelect1 = row1.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement;
    await act(async () => {
      selectChange(projectSelect1, "p-2");
    });
    expect(headerBudgetBadge()).toBeNull();

    await act(async () => {
      selectChange(projectSelect1, "");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => headerBudgetBadge() !== null);
    expect(container.textContent).toContain("Within budget");
    expect(mockSuggestCoding.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ amount: "100.00", project_public_id: "p-1" }),
    );
  });

  it("r5-5 moving a covered line to p-2 hides chip immediately including when vendor cleared", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      budget_check: "fits" as const,
      budget_remaining: "1.00",
    });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "100");
      fillHeader();
    });
    await flushUntil(() => headerBudgetBadge() !== null);

    const row = container.querySelectorAll("tbody tr")[0];
    const projectSelect = row.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement;
    await act(async () => {
      selectChange(projectSelect, "p-2");
    });
    expect(headerBudgetBadge()).toBeNull();

    const vendorSelect = container.querySelector("#vendor_public_id") as HTMLSelectElement;
    const callsBefore = mockSuggestCoding.mock.calls.length;
    await act(async () => {
      selectChange(vendorSelect, "");
    });
    expect(mockSuggestCoding.mock.calls.length).toBe(callsBefore);
    expect(headerBudgetBadge()).toBeNull();
  });

  it("r5-6 no chip without project hint, wrong response project, no_project check, or invalid amount", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      project_public_id: "p-2",
      budget_check: "fits" as const,
      budget_remaining: "1.00",
    });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillHeader();
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length >= 1);
    expect(headerBudgetBadge()).toBeNull();

    mockSuggestCoding.mockResolvedValueOnce({
      ...codingSuggestionPayload(),
      budget_check: "no_project" as const,
      budget_remaining: null,
    });
    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "100");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length >= 2);
    expect(headerBudgetBadge()).toBeNull();

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "100");
    });
    await act(async () => {
      findButton("+ Add Line").click();
    });
    await flushUntil(() => container.querySelectorAll("tbody tr").length >= 2);
    await act(async () => {
      fillLineRow(1, "bad amount", "p-1");
      fillLineRate(1, "not-money");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(headerBudgetBadge()).toBeNull();
  });

  it("r1-1 hides budget chip when line amount changes before suggest response lands", async () => {
    let resolveSuggest!: (value: Record<string, unknown>) => void;
    mockSuggestCoding.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSuggest = resolve;
        }),
    );

    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "100");
      fillHeader();
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length >= 1);

    await act(async () => {
      fillLineRate(0, "2000");
    });

    await act(async () => {
      resolveSuggest({
        ...codingSuggestionPayload(),
        budget_check: "fits" as const,
        budget_remaining: "500.00",
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    await flushUntil(() => container.querySelector(".status-badge.coding-suggested") !== null);
    expect(container.textContent).not.toContain("Within budget");
    expect(headerBudgetBadge()).toBeNull();
  });

  it("r1-2 hides budget chip after editing line amount from a visible chip", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      budget_check: "over" as const,
      budget_remaining: "-50.00",
    });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "100");
      fillHeader();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await flushUntil(() => headerBudgetBadge() !== null);
    expect(container.textContent).toContain("Over by $50.00");

    await act(async () => {
      fillLineRate(0, "2000");
    });

    await flushUntil(() => headerBudgetBadge() === null);
    expect(container.textContent).not.toContain("Over by $50.00");
  });

  it("r1-5 clears budget chip when vendor changes and suggest returns none", async () => {
    mockSuggestCoding
      .mockResolvedValueOnce({
        ...codingSuggestionPayload(),
        budget_check: "fits" as const,
        budget_remaining: "1.00",
      })
      .mockResolvedValueOnce(null);

    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      fillLineRate(0, "100");
      fillHeader();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await flushUntil(() => headerBudgetBadge() !== null);
    expect(container.textContent).toContain("Within budget");

    const vendorSelect = container.querySelector("#vendor_public_id") as HTMLSelectElement;
    await act(async () => {
      selectChange(vendorSelect, "v-2");
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length >= 2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await flushUntil(() => headerBudgetBadge() === null);
    expect(container.textContent).not.toContain("Within budget");
  });

  it("r3-4 debounces memo: five keystrokes within 400ms yield one suggest call after debounce", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillHeader();
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length >= 1);
    const callsAfterVendor = mockSuggestCoding.mock.calls.length;

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(memo, "a");
      setTextareaValue(memo, "ab");
      setTextareaValue(memo, "abc");
      setTextareaValue(memo, "abcd");
      setTextareaValue(memo, "abcde");
    });
    expect(mockSuggestCoding.mock.calls.length).toBe(callsAfterVendor);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length === callsAfterVendor + 1);
    expect(mockSuggestCoding.mock.calls.length).toBe(callsAfterVendor + 1);
    expect(mockSuggestCoding.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ memo: "abcde" }),
    );
  });

  it("r4-1 does not suggest with stale memo before debounce when vendor is picked", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    const vendorSelect = container.querySelector("#vendor_public_id") as HTMLSelectElement;
    await act(async () => {
      setTextareaValue(memo, "final memo");
      selectChange(vendorSelect, "v-1");
    });
    expect(mockSuggestCoding).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => mockSuggestCoding.mock.calls.length === 1);
    expect(mockSuggestCoding.mock.calls[0][0]).toEqual(
      expect.objectContaining({ memo: "final memo", vendor_public_id: "v-1" }),
    );
  });
});

function okReadFromFile(overrides: Record<string, unknown> = {}) {
  return {
    status: "ok" as const,
    message: null,
    fields: {
      ...emptyReadFields(),
      vendor: {
        value: { public_id: "v-1", name: "Acme" },
        extracted_name: "Acme",
        confidence: "0.95",
      },
      bill_number: { value: "INV-42", confidence: "0.9" },
      bill_date: { value: "2026-03-10", confidence: "0.9" },
      total_amount: { value: "500.00", confidence: "0.85" },
      description: { value: "From PDF", confidence: "0.8" },
      long_description: { value: "Full mowing summary", confidence: "0.7" },
      reference: { value: "PO 999", confidence: "0.6" },
    },
    coding: {
      project_public_id: "p-1",
      project_name: "Project One",
      sub_cost_code_public_id: "scc-pub",
      sub_cost_code_number: "01-100",
      sub_cost_code_name: "SCC Ten",
      source: "llm" as const,
      reason: "invoice text",
      confidence: 0.77,
      model_version: "v1",
      budget_check: null,
      budget_remaining: null,
    },
    model: "test-model",
    ...overrides,
  };
}

describe("BillCreate PDF read attachment", () => {
  it("uploads on drop, reads with attachment id, and shows From file badges", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);

    await attachPdf();

    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(mockUploadFile).toHaveBeenCalledWith("/api/v1/upload/attachment", expect.any(File));
    expect(mockReadBillAttachment).toHaveBeenCalledWith(
      "att-1",
      null,
      expect.any(AbortSignal),
    );
    await flushUntil(() => container.textContent?.includes("From file"));
    expect((container.querySelector("#bill_number") as HTMLInputElement).value).toBe("INV-42");
    expect((container.querySelector("#bill_date") as HTMLInputElement).value).toBe("2026-03-10");
    expect(sccSelectAt(0).value).toBe("10");
  });

  it("Save reuses uploaded attachment id (single upload across drop and save)", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      await attachPdf();
    });
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);

    await act(async () => {
      findButton("Save For Later").click();
    });
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill"));

    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(createBillBody().attachment_public_id).toBe("att-1");
  });

  it("does not overwrite user-typed header and line fields", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);

    await act(async () => {
      selectChange(container.querySelector("#vendor_public_id") as HTMLSelectElement, "v-2");
      setInputValue(container.querySelector("#bill_number") as HTMLInputElement, "USER-N");
      setInputValue(container.querySelector("#bill_date") as HTMLInputElement, "2026-01-01");
      setInputValue(descriptionInputAt(0), "User desc");
      setInputValue(rateInputAt(0), "99");
      await attachPdf();
    });
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);

    expect((container.querySelector("#vendor_public_id") as HTMLSelectElement).value).toBe("v-2");
    expect((container.querySelector("#bill_number") as HTMLInputElement).value).toBe("USER-N");
    expect(descriptionInputAt(0).value).toBe("User desc");
    expect(rateInputAt(0).value).toBe("99");
  });

  it("blocks Save while reading; submit stays gated on project not file labels", async () => {
    let resolveRead!: (v: ReturnType<typeof okReadFromFile>) => void;
    mockReadBillAttachment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);

    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const pendingFile = new File(["x"], "bill.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [pendingFile], configurable: true });
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await flushUntil(() => container.textContent?.includes("Reading invoice"));
    expect(findButton("Save For Later").disabled).toBe(true);

    await act(async () => {
      resolveRead(
        okReadFromFile({
          coding: {
            ...okReadFromFile().coding,
            project_public_id: null,
            project_name: null,
          },
        }),
      );
      await Promise.resolve();
    });
    await flushUntil(() => container.textContent?.includes("From file"));

    expect(findButton("Save For Later").disabled).toBe(false);
    expect(submitForReviewButton().disabled).toBe(true);
    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
    });
    await flushUntil(() => !submitForReviewButton().disabled);
  });

  it("Change file aborts read and clears unaccepted file prefills", async () => {
    let capturedSignal: AbortSignal | undefined;
    mockReadBillAttachment.mockImplementationOnce(
      (_id, _p, signal) =>
        new Promise(() => {
          capturedSignal = signal;
        }),
    );
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => capturedSignal !== undefined);
    await flushUntil(() => container.querySelector('iframe[title="Bill PDF preview"]') !== null);

    await act(async () => {
      findButton("Change file").click();
    });
    expect(capturedSignal?.aborted).toBe(true);
    expect((container.querySelector("#bill_number") as HTMLInputElement | null)?.value ?? "").toBe(
      "",
    );
  });

  it.each([
    ["unreadable", { status: "unreadable", message: "Could not parse PDF", fields: emptyReadFields(), coding: null, model: null }],
    ["timeout", { status: "timeout", message: "Timed out", fields: emptyReadFields(), coding: null, model: null }],
    ["ai_unavailable", { status: "ai_unavailable", message: "AI paused", fields: emptyReadFields(), coding: null, model: null }],
    ["disabled", disabledReadResult()],
  ] as const)("status %s shows expected inline behavior", async (_label, payload) => {
    mockReadBillAttachment.mockResolvedValue(payload);
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    if (payload.status === "disabled") {
      expect(container.textContent).not.toContain("Could not read");
      expect((container.querySelector("#bill_number") as HTMLInputElement).value).toBe("");
    } else {
      await flushUntil(() => container.textContent?.includes(payload.message ?? ""));
      expect((container.querySelector("#bill_number") as HTMLInputElement).value).toBe("");
    }
  });

  it("HTTP read failure shows generic message without filling", async () => {
    mockReadBillAttachment.mockResolvedValue(null);
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("Could not read this PDF"));
  });

  it("read coding then history suggest both apply via empty-cell rules", async () => {
    mockReadBillAttachment.mockResolvedValue(
      okReadFromFile({
        coding: {
          project_public_id: "p-1",
          project_name: "Project One",
          sub_cost_code_public_id: "scc-pub",
          sub_cost_code_number: "01-100",
          sub_cost_code_name: "SCC Ten",
          source: "llm" as const,
          reason: "from file",
          confidence: 0.9,
          model_version: "v1",
          budget_check: null,
          budget_remaining: null,
        },
      }),
    );
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      sub_cost_code_public_id: "scc-user",
      source: "vendor_history" as const,
      confidence: 0.5,
    });
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => sccSelectAt(0).value === "10");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(sccSelectAt(0).value).toBe("10");
  });

  it("Save sends line_amount and total from file rate without accept controls", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("From file"));
    await act(async () => {
      findButton("Save For Later").click();
    });
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill"));
    const body = createBillBody();
    expect(body.line_amount).toBe(500);
    expect(body.total_amount).toBe(500);
    expect(body.line_rate).toBe(500);
  });

  it("U-676k Save For Later stays enabled with file-filled header and line-1 labels", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("From file"));
    expect(findButton("Save For Later").disabled).toBe(false);
    await act(async () => {
      findButton("Save For Later").click();
    });
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill"));
    expect(mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill")).toBe(true);
  });

  it("U-676k does not render accept controls on Bill Create", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await act(async () => {
      fillHeader();
      fillLineRow(0, "Line one", "p-1");
    });
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("Suggested"));
    expect(findButton("Accept all suggestions")).toBeUndefined();
    expect(container.querySelector(".btn-coding-accept")).toBeNull();
  });

  it("does not overwrite fields the user edited while the read is in flight", async () => {
    let resolveRead!: (v: ReturnType<typeof okReadFromFile>) => void;
    mockReadBillAttachment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await act(async () => {
      setInputValue(container.querySelector("#bill_number") as HTMLInputElement, "TYPED");
      setInputValue(descriptionInputAt(0), "typed desc");
    });
    await act(async () => {
      resolveRead(okReadFromFile());
      await Promise.resolve();
    });
    await flushUntil(() => !container.textContent?.includes("Reading invoice"));
    expect((container.querySelector("#bill_number") as HTMLInputElement).value).toBe("TYPED");
    expect(descriptionInputAt(0).value).toBe("typed desc");
    expect((container.querySelector("#bill_date") as HTMLInputElement).value).toBe("2026-03-10");
  });

  it("Change file clears unaccepted line-1 scalars and a second read refills them", async () => {
    mockReadBillAttachment.mockResolvedValueOnce(okReadFromFile());
    mockReadBillAttachment.mockResolvedValueOnce(
      okReadFromFile({
        fields: {
          ...emptyReadFields(),
          vendor: {
            value: { public_id: "v-1", name: "Acme" },
            extracted_name: "Acme",
            confidence: "0.95",
          },
          bill_number: { value: "INV-99", confidence: "0.9" },
          bill_date: { value: "2026-03-11", confidence: "0.9" },
          total_amount: { value: "120.00", confidence: "0.85" },
          description: { value: "Second PDF", confidence: "0.8" },
        },
      }),
    );
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("From file"));
    await act(async () => {
      setInputValue(
        container.querySelector("#bill_number") as HTMLInputElement,
        "INV-43",
      );
    });
    await act(async () => {
      findButton("Change file").click();
    });
    expect((container.querySelector("#bill_number") as HTMLInputElement).value).toBe("INV-43");
    expect(descriptionInputAt(0).value).toBe("");
    expect(rateInputAt(0).value).toBe("");

    await attachPdf();
    await flushUntil(() => descriptionInputAt(0).value === "Second PDF");
    expect(rateInputAt(0).value).toBe("120.00");
  });

  it("applies vendor and SCC when lookups load before the read resolves", async () => {
    (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups = true;
    let resolveRead!: (v: ReturnType<typeof okReadFromFile>) => void;
    mockReadBillAttachment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    delete (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups;
    await act(async () => {
      setInputValue(descriptionInputAt(0), "rerender");
      setInputValue(descriptionInputAt(0), "");
    });
    await act(async () => {
      resolveRead(okReadFromFile());
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    await flushUntil(
      () => (container.querySelector("#vendor_public_id") as HTMLSelectElement).value === "v-1",
    );
    expect(sccSelectAt(0).value).toBe("10");
  });

  it("partial read status still fills header fields from the file", async () => {
    mockReadBillAttachment.mockResolvedValue(
      okReadFromFile({
        status: "partial",
        coding: null,
        fields: {
          ...emptyReadFields(),
          bill_number: { value: "PART-1", confidence: "0.5" },
          bill_date: { value: "2026-05-01", confidence: "0.5" },
        },
      }),
    );
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => (container.querySelector("#bill_number") as HTMLInputElement).value === "PART-1");
    expect((container.querySelector("#bill_date") as HTMLInputElement).value).toBe("2026-05-01");
  });

  it("shows upload failure message distinct from read failure", async () => {
    mockUploadFile.mockRejectedValueOnce(new Error("network"));
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("Could not upload this PDF"));
  });

  it("keeps Cancel enabled while reading", async () => {
    mockReadBillAttachment.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("Reading invoice"));
    expect(findButton("Cancel").disabled).toBe(false);
  });

  it("file coding fills line 1 only when two lines exist", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      findButton("+ Add Line").click();
    });
    await flushUntil(() => container.querySelectorAll("tbody tr").length === 2);
    await attachPdf();
    await flushUntil(() => sccSelectAt(0).value === "10");
    expect(sccSelectAt(1).value).toBe("");
  });

  async function acceptEachVisibleFileCheck() {
    for (let i = 0; i < 12; i++) {
      const btn = container.querySelector(
        "button[aria-label^='Accept']",
      ) as HTMLButtonElement | null;
      if (!btn) break;
      await act(async () => {
        btn.click();
      });
    }
  }

  it("enables Save once file labels appear (quantity is not a hidden gate)", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("From file"));
    expect(findButton("Save For Later").disabled).toBe(false);
    expect(container.querySelector("button[aria-label^='Accept']")).toBeNull();
  });

  it("enables Save after editing every file-filled field (edits count as accept)", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("From file"));
    await act(async () => {
      setInputValue(rateInputAt(0), "450");
      setInputValue(descriptionInputAt(0), "edited");
      setInputValue(container.querySelector("#bill_number") as HTMLInputElement, "X1");
      setInputValue(container.querySelector("#bill_date") as HTMLInputElement, "2026-03-11");
      selectChange(container.querySelector("#vendor_public_id") as HTMLSelectElement, "v-2");
      fillLineScc(0, "99");
    });
    await flushUntil(() => !findButton("Save For Later").disabled);
    expect(findButton("Save For Later").disabled).toBe(false);
  });

  it("Change file reverts line-1 coding; second read applies new SCC", async () => {
    mockReadBillAttachment.mockResolvedValueOnce(okReadFromFile());
    let resolveB!: (v: ReturnType<typeof okReadFromFile>) => void;
    mockReadBillAttachment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveB = resolve;
        }),
    );
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => sccSelectAt(0).value === "10");
    await act(async () => {
      findButton("Change file").click();
    });
    expect(sccSelectAt(0).value).toBe("");
    expect(container.textContent?.includes("From file")).toBe(false);
    await attachPdf();
    await act(async () => {
      resolveB(
        okReadFromFile({
          coding: {
            ...okReadFromFile().coding,
            sub_cost_code_public_id: "scc-user",
            sub_cost_code_number: "99-999",
            sub_cost_code_name: "User SCC",
          },
        }),
      );
      await vi.advanceTimersByTimeAsync(20);
    });
    await flushUntil(() => sccSelectAt(0).value === "99");
    expect(sccSelectAt(0).value).toBe("99");
  });

  it("does not apply a deferred read after Change file when lookups were loading", async () => {
    (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups = true;
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    await act(async () => {
      findButton("Change file").click();
    });
    delete (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups;
    await act(async () => {
      setTextareaValue(container.querySelector("textarea") as HTMLTextAreaElement, "m");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect((container.querySelector("#bill_number") as HTMLInputElement).value).toBe("");
    expect(sccSelectAt(0).value).toBe("");
    expect(container.textContent?.includes("From file")).toBe(false);
  });

  it("second drop while lookups loading applies only the latest read when lookups arrive", async () => {
    (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups = true;
    mockReadBillAttachment.mockResolvedValueOnce(okReadFromFile());
    mockReadBillAttachment.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    await attachPdf();
    delete (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups;
    await act(async () => {
      setTextareaValue(container.querySelector("textarea") as HTMLTextAreaElement, "m");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect((container.querySelector("#bill_number") as HTMLInputElement).value).toBe("");
    expect(container.textContent?.includes("From file")).toBe(false);
  });

  it("keeps Save disabled while a read result is pending on lookups", async () => {
    (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups = true;
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("Reading invoice"));
    expect(findButton("Save For Later").disabled).toBe(true);
    delete (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups;
    await act(async () => {
      setTextareaValue(container.querySelector("textarea") as HTMLTextAreaElement, "m");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    await flushUntil(() => container.textContent?.includes("From file"));
    expect(findButton("Save For Later").disabled).toBe(false);
  });

  it("clears Reading invoice and unlocks Save once a lookups-deferred read is applied", async () => {
    (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups = true;
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    stubPost();
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("Reading invoice"));
    // Precondition: the read is really deferred (still reading, nothing applied yet).
    expect(container.textContent).toContain("Reading invoice");
    expect((container.querySelector("#vendor_public_id") as HTMLSelectElement).value).toBe("");
    delete (globalThis as { __billCreateEmptyLookups?: boolean }).__billCreateEmptyLookups;
    await act(async () => {
      setTextareaValue(container.querySelector("textarea") as HTMLTextAreaElement, "m");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    await flushUntil(() => container.textContent?.includes("From file"));
    // Precondition: the deferred result really was applied (vendor from the file).
    expect((container.querySelector("#vendor_public_id") as HTMLSelectElement).value).toBe("v-1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(container.textContent).not.toContain("Reading invoice");
    expect(findButton("Save For Later").disabled).toBe(false);
  });

  it("Change file leaves a history-hook cost code alone when the file filled nothing", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      project_public_id: null,
      project_name: null,
      source: "vendor_history" as const,
    });
    mockReadBillAttachment.mockResolvedValue(disabledReadResult());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      selectChange(container.querySelector("#vendor_public_id") as HTMLSelectElement, "v-1");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    // Precondition: the hook prefilled line 1.
    await flushUntil(() => sccSelectAt(0).value !== "");
    const hookScc = sccSelectAt(0).value;
    expect(hookScc).not.toBe("");
    await attachPdf();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    await act(async () => {
      findButton("Change file").click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(sccSelectAt(0).value).toBe(hookScc);
  });

  it("file read replaces an unaccepted hook SCC with the file project+SCC pair", async () => {
    mockSuggestCoding.mockResolvedValueOnce({
      ...codingSuggestionPayload(),
      project_public_id: null,
      project_name: null,
      source: "vendor_history" as const,
    });
    mockSuggestCoding.mockResolvedValue(null);
    let resolveRead!: (v: ReturnType<typeof okReadFromFile>) => void;
    mockReadBillAttachment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      selectChange(container.querySelector("#vendor_public_id") as HTMLSelectElement, "v-1");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await flushUntil(() => sccSelectAt(0).value !== "");
    expect(projectSelectValueAt(0)).toBe("");
    await attachPdf();
    await act(async () => {
      resolveRead(okReadFromFile());
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    await flushUntil(() => projectSelectValueAt(0) === "p-1");
    expect(sccSelectAt(0).value).toBe("10");
    await act(async () => {
      findButton("Change file").click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(sccSelectAt(0).value).toBe("");
    expect(projectSelectValueAt(0)).toBe("");
  });

  it("aborts an in-flight read on real unmount", async () => {
    mockReadBillAttachment.mockImplementationOnce(() => new Promise(() => {}));
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    const sig = mockReadBillAttachment.mock.calls[0]?.[2] as AbortSignal | undefined;
    await act(async () => {
      root.unmount();
    });
    expect(sig?.aborted).toBe(true);
    root = createRoot(container);
  });

  it("file read replaces an earlier history hook prefill with the file pair", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      sub_cost_code_public_id: "scc-user",
      source: "history" as const,
    });
    let resolveRead!: (v: ReturnType<typeof okReadFromFile>) => void;
    mockReadBillAttachment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      selectChange(container.querySelector("#vendor_public_id") as HTMLSelectElement, "v-1");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await attachPdf();
    await flushUntil(() => sccSelectAt(0).value === "99");
    await act(async () => {
      resolveRead(okReadFromFile());
      await vi.advanceTimersByTimeAsync(20);
    });
    expect(sccSelectAt(0).value).toBe("10");
    expect(projectSelectValueAt(0)).toBe("p-1");
  });

  it("removing the file-prefilled line clears badges from the new first row", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      findButton("+ Add Line").click();
    });
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("From file"));
    await act(async () => {
      (
        container.querySelector('button[aria-label="Remove line 1"]') as HTMLButtonElement
      ).click();
    });
    const newFirstRow = container.querySelectorAll("tbody tr")[0];
    expect(newFirstRow.textContent?.includes("From file")).toBe(false);
    expect(newFirstRow.querySelector("[class*='coding-suggested']")).toBeNull();
    await acceptEachVisibleFileCheck();
    await flushUntil(() => !findButton("Save For Later").disabled);
    expect(findButton("Save For Later").disabled).toBe(false);
  });

  it("does not fill project when file coding SCC does not map to lookups", async () => {
    mockReadBillAttachment.mockResolvedValue(
      okReadFromFile({
        coding: {
          project_public_id: "p-1",
          project_name: "Project One",
          sub_cost_code_public_id: "scc-unmapped",
          sub_cost_code_number: "XX",
          sub_cost_code_name: "Missing",
          source: "llm" as const,
          reason: "invoice",
          confidence: 0.5,
          model_version: "v1",
          budget_check: null,
          budget_remaining: null,
        },
      }),
    );
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    const row = container.querySelectorAll("tbody tr")[0];
    const projectSelect = row.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement;
    expect(projectSelect.value).toBe("");
    expect(sccSelectAt(0).value).toBe("");
  });

  it("does not refill a header field cleared by the user before the read lands", async () => {
    let resolveRead!: (v: ReturnType<typeof okReadFromFile>) => void;
    mockReadBillAttachment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await act(async () => {
      const billNum = container.querySelector("#bill_number") as HTMLInputElement;
      setInputValue(billNum, "TEMP");
      setInputValue(billNum, "");
    });
    await act(async () => {
      resolveRead(okReadFromFile());
      await Promise.resolve();
    });
    await flushUntil(() => !container.textContent?.includes("Reading invoice"));
    expect((container.querySelector("#bill_number") as HTMLInputElement).value).toBe("");
  });

  const expectedAutoMemo =
    "A D via PDF upload | Full mowing summary | Ref: PO 999";

  it("file picker auto memo starts with via PDF upload", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('textarea[name="memo"]') !== null);
    await attachPdf();
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await flushUntil(() => memo.value.includes("via PDF upload"));
    expect(memo.value).toBe(expectedAutoMemo);
    expect(memo.value).not.toContain("From PDF");
    expect(memo.value).not.toMatch(/\bP1\b|01-100/);
  });

  it("drop auto memo starts with via PDF drop", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector(".drop-zone") !== null);
    await attachPdfViaDrop();
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await flushUntil(() => memo.value.includes("via PDF drop"));
    expect(memo.value).toBe(
      "A D via PDF drop | Full mowing summary | Ref: PO 999",
    );
  });

  it("editing bill number to differ adds DOC# from read; matching again removes it", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('textarea[name="memo"]') !== null);
    await attachPdf();
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await flushUntil(() => memo.value === expectedAutoMemo);
    const billNum = container.querySelector("#bill_number") as HTMLInputElement;
    await act(async () => {
      setInputValue(billNum, "USER-EDIT");
    });
    await flushUntil(() => memo.value.includes("DOC#: INV-42"));
    expect(memo.value).toBe(`${expectedAutoMemo} | DOC#: INV-42`);
    await act(async () => {
      setInputValue(billNum, "INV-42");
    });
    await flushUntil(() => !memo.value.includes("DOC#:"));
    expect(memo.value).toBe(expectedAutoMemo);
  });

  it("stops auto memo updates after the user edits Memo", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('textarea[name="memo"]') !== null);
    await attachPdf();
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await flushUntil(() => memo.value.includes("via PDF upload"));
    await act(async () => {
      setTextareaValue(memo, "My memo");
    });
    const billNum = container.querySelector("#bill_number") as HTMLInputElement;
    await act(async () => {
      setInputValue(billNum, "OTHER");
    });
    expect(memo.value).toBe("My memo");
  });

  it("does not gate Save on auto memo text", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("From file"));
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await flushUntil(() => memo.value.length > 0);
    const memoGroup = memo.closest(".form-group");
    expect(memoGroup?.textContent?.includes("From file")).toBe(false);
    expect(memoGroup?.querySelector(".btn-coding-accept")).toBeNull();
    expect(findButton("Save For Later").disabled).toBe(false);
    expect(memo.value.length).toBeGreaterThan(0);
  });

  it("Change file clears an untouched auto memo", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await flushUntil(() => memo.value.length > 0);
    await act(async () => {
      findButton("Change file").click();
    });
    expect(memo.value).toBe("");
  });

  it("Change file keeps a user-edited memo", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('textarea[name="memo"]') !== null);
    await attachPdf();
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await flushUntil(() => memo.value.length > 0);
    await act(async () => {
      setTextareaValue(memo, "Kept memo");
    });
    await act(async () => {
      findButton("Change file").click();
    });
    expect(memo.value).toBe("Kept memo");
  });

  it("coding hook stands down on line 1 while a PDF is attached but still fills line 2", async () => {
    mockReadBillAttachment.mockResolvedValue(
      okReadFromFile({
        coding: {
          project_public_id: "p-1",
          project_name: "Project One",
          sub_cost_code_public_id: "scc-unmapped",
          sub_cost_code_number: "XX",
          sub_cost_code_name: "Missing",
          source: "llm" as const,
          reason: "invoice",
          confidence: 0.5,
          model_version: "v1",
          budget_check: null,
          budget_remaining: null,
        },
      }),
    );
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      sub_cost_code_public_id: "scc-user",
      project_public_id: "p-1",
    });
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    expect(sccSelectAt(0).value).toBe("");
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      selectChange(container.querySelector("#vendor_public_id") as HTMLSelectElement, "v-1");
      findButton("+ Add Line").click();
    });
    await flushUntil(() => container.querySelectorAll("tbody tr").length === 2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(sccSelectAt(0).value).toBe("");
    await act(async () => {
      fillLineRow(1, "Second line", "p-1");
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => sccSelectAt(1).value === "99");
    expect(sccSelectAt(0).value).toBe("");
    expect(sccSelectAt(1).value).toBe("99");
  });

  it("live auto memo updates do not re-call suggestCoding", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayload(),
      sub_cost_code_public_id: "scc-user",
      project_public_id: "p-1",
    });
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      selectChange(container.querySelector("#vendor_public_id") as HTMLSelectElement, "v-1");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await attachPdf();
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await flushUntil(() => memo.value.length > 0);
    const callsAfterRead = mockSuggestCoding.mock.calls.length;
    const row = container.querySelectorAll("tbody tr")[0];
    const descInput = row.querySelectorAll("td")[0].querySelector("input") as HTMLInputElement;
    await act(async () => {
      setInputValue(descInput, "Extra words");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(memo.value).toBe(expectedAutoMemo);
    const billNum = container.querySelector("#bill_number") as HTMLInputElement;
    await act(async () => {
      setInputValue(billNum, "CHANGED");
    });
    await flushUntil(() => memo.value.includes("DOC#:"));
    expect(mockSuggestCoding.mock.calls.length).toBe(callsAfterRead);
  });

  it("does not auto-fill memo after the user cleared Memo while the read was in flight", async () => {
    let resolveRead!: (v: ReturnType<typeof okReadFromFile>) => void;
    mockReadBillAttachment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    renderPage();
    await flushUntil(() => container.querySelector('textarea[name="memo"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("Reading invoice"));
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(memo, " ");
      setTextareaValue(memo, "");
    });
    await act(async () => {
      resolveRead(okReadFromFile());
      await Promise.resolve();
    });
    await flushUntil(() => !container.textContent?.includes("Reading invoice"));
    expect(memo.value).toBe("");
  });

  it("line item row cells pin the alignment DOM contract", () => {
    renderPage();
    const table = container.querySelector(".bill-create-lines");
    expect(table).toBeTruthy();
    const cells = container.querySelectorAll(".bill-create-lines tbody tr td");
    expect(cells.length).toBeGreaterThan(0);
    for (const td of cells) {
      expect(td.classList.contains("line-item-cell")).toBe(true);
      expect(td.querySelector(".line-item-badge-slot")).toBeTruthy();
    }
  });

  it("U-676i line table pins column colgroup for width contract", () => {
    renderPage();
    const table = container.querySelector(".bill-create-lines");
    expect(table?.querySelector("colgroup col.bill-create-col-desc")).toBeTruthy();
    expect(table?.querySelector("colgroup col.bill-create-col-qty")).toBeTruthy();
    expect(table?.querySelector("colgroup col.bill-create-col-markup")).toBeTruthy();
  });

  it("U-676k bill-create-lines colgroup pins width contract (no col min-width floors)", () => {
    renderPage();
    const table = container.querySelector(".bill-create-lines");
    const colContract = (cls: string) =>
      table?.querySelector(`col.${cls}`)?.getAttribute("data-width-contract");
    // Measured in a browser (U-676k): at a 1440px window a 5-word description, "43.00 — Millwork &
    // Trim" and "HP2 - 4406 Harding" fit; at 1280px nothing overflows the content area.
    expect(colContract("bill-create-col-desc")).toBe("24%");
    expect(colContract("bill-create-col-scc")).toBe("23%");
    expect(colContract("bill-create-col-project")).toBe("21%");
    expect(colContract("bill-create-col-qty")).toBe("3.25rem");
    expect(colContract("bill-create-col-markup")).toBe("4.5rem");
    for (const col of table!.querySelectorAll("colgroup col")) {
      expect(col.getAttribute("style")).toBeNull();
    }
  });

  it("U-676i file read labels cost code and project as From file", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() => container.textContent?.includes("From file · AI 77%"));
    expect(container.textContent).toContain("From file · AI 77%");
    const row = container.querySelectorAll(".bill-create-lines tbody tr")[0];
    const projectSlot = row.querySelectorAll("td")[2].querySelector(".line-item-badge-slot");
    expect(projectSlot?.textContent).toContain("From file");
  });

  it("U-676i vendor-history hook keeps Suggested label on line row", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayload());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      fillHeader();
    });
    await flushUntil(() => container.textContent?.includes("Suggested 72%"));
    expect(container.textContent).not.toContain("From file ·");
  });

  it("U-676i every line-row suggestion chip shares bill-create-line-chip", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector('input[type="file"]') !== null);
    await attachPdf();
    await flushUntil(() =>
      container.querySelector(".bill-create-lines .bill-create-line-chip") !== null,
    );
    const row = container.querySelector(".bill-create-lines tbody tr");
    const chips = row!.querySelectorAll(".line-item-badge-slot .bill-create-line-chip");
    expect(chips.length).toBeGreaterThanOrEqual(3);
    row!.querySelectorAll(".line-item-badge-slot .status-badge").forEach((badge) => {
      expect(badge.classList.contains("bill-create-line-chip")).toBe(true);
    });
    expect(row!.querySelectorAll(".line-item-badge-slot .btn-coding-accept").length).toBe(0);
  });

  it("BillEdit line table does not use BillCreate-only layout class", () => {
    expect(billEditSource).toContain('className="data-table line-items-edit-table"');
    expect(billEditSource).not.toContain("bill-create-lines");
    expect(billEditSource).not.toContain("bill-create-line-chip");
  });
});


describe("BillCreate intake_source on create", () => {
  it("includes pdf_upload when the PDF came from the file picker", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      await attachPdf();
    });
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    await act(async () => {
      findButton("Save For Later").click();
    });
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill"));
    expect(createBillBody().intake_source).toBe("pdf_upload");
  });

  it("includes pdf_drop when the PDF was dropped on the page", async () => {
    mockReadBillAttachment.mockResolvedValue(okReadFromFile());
    renderPage();
    await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
    await act(async () => {
      fillLineRow(0, "Line one", "p-1");
      await attachPdfViaDrop();
    });
    await flushUntil(() => mockReadBillAttachment.mock.calls.length >= 1);
    await act(async () => {
      findButton("Save For Later").click();
    });
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/create/bill"));
    expect(createBillBody().intake_source).toBe("pdf_drop");
  });

});

describe("projectOptionLabel (U-676k)", () => {
  it("does not repeat an abbreviation the project name already starts with", async () => {
    const { projectOptionLabel } = await import("./BillCreate");
    expect(projectOptionLabel("HP2", "HP2 - 4406 Harding")).toBe("HP2 - 4406 Harding");
    expect(projectOptionLabel("WR", "WR - 5224 Williamsburg")).toBe("WR - 5224 Williamsburg");
    expect(projectOptionLabel("hp2", "HP2: Harding")).toBe("HP2: Harding");
    expect(projectOptionLabel("HP2", "Harding Place")).toBe("HP2 — Harding Place");
    expect(projectOptionLabel("HP", "HP2 - 4406 Harding")).toBe("HP — HP2 - 4406 Harding");
    expect(projectOptionLabel(null, "Harding Place")).toBe("Harding Place");
  });
});
