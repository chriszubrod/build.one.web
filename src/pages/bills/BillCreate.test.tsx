import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BillCreate from "./BillCreate";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue } from "../../__testutils__/domEvents";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockUploadFile = vi.fn();
const mockToast = vi.fn();

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
  useLookups: () => ({
    data: {
      vendors: [{ public_id: "v-1", id: 1, name: "Acme" }],
      payment_terms: [
        { public_id: "pt-1", id: 1, name: "Due on receipt", due_days: 0 },
        { public_id: "pt-30", id: 2, name: "Net 30", due_days: 30 },
      ],
      projects: [
        { public_id: "p-1", id: 1, name: "Project One", abbreviation: "P1" },
        { public_id: "p-2", id: 2, name: "Project Two", abbreviation: "P2" },
      ],
      sub_cost_codes: [{ id: 10, number: "01-100", name: "SCC Ten" }],
    },
    loading: false,
  }),
}));

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

function renderPage() {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/bill/create"] },
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

function attachPdf() {
  const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["x"], "bill.pdf", { type: "application/pdf" });
  Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
}

function findButton(label: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  ) as HTMLButtonElement;
}

function submitForReviewButton(): HTMLButtonElement {
  return findButton("Submit For Review");
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
    attachPdf();
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
    attachPdf();
  });
}

async function arrangeOneLineBill(project = "p-1") {
  renderPage();

  await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
  expect(container.querySelector("#vendor_public_id")).toBeTruthy();

  await act(async () => {
    fillHeader();
    fillLineRow(0, "Line one", project);
    attachPdf();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });
  mockUploadFile.mockResolvedValue({ public_id: "att-1", content_type: "application/pdf" });
  mockPut.mockResolvedValue({});
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

    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-1");

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
      attachPdf();
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
    expect(mockToast.mock.calls.length).toBeGreaterThan(0);

    const createBillCall = mockPost.mock.calls.find(
      (c) => c[0] === "/api/v1/create/bill",
    );
    expect(createBillCall).toBeTruthy();
    expect((createBillCall![1] as Record<string, unknown>).submit_for_review).toBe(false);

    expect(
      mockPost.mock.calls.some((c) => String(c[0]).startsWith("/api/v1/submit/review/")),
    ).toBe(false);
    expect(mockToast).toHaveBeenCalled();
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

    expect(mockToast).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/bill/bill-1/edit");
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/bill-1");
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
