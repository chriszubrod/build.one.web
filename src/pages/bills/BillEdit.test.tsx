import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BillEdit from "./BillEdit";
import ReviewTimeline from "../../components/ReviewTimeline";
import { ApiError } from "../../api/client";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue, setTextareaValue } from "../../__testutils__/domEvents";
import {
  clearCombobox,
  comboboxInput,
  getComboboxValue,
  pickComboboxOptionByValue,
  tabAwayFromCombobox,
  waitForCombobox,
} from "../../test/combobox";
import { entityItemKey, entityListKey } from "../../hooks/useEntity";
import type { Bill, BillLineItem } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BILL_GET_PATH = "/api/v1/get/bill/bill-1";
const BILL_LINE_ITEMS_PATH = "/api/v1/get/bill_line_items/bill/1";

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();
const mockToast = vi.fn();
const mockNavigate = vi.fn();
const mockUseViewAttachmentObjectUrl = vi.fn(() => ({
  objectUrl: "blob:test",
  loading: false,
  loadError: null,
}));
const mockSuggestCoding = vi.fn();
const lookupHookCalls = vi.hoisted(() => ({ n: 0 }));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
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

vi.mock("../../hooks/useLookups", () => ({
  useLookups: (include: string) => {
    lookupHookCalls.n += 1;
    void include;
    return { data: {}, loading: false };
  },
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

vi.mock("../../components/ReviewTimeline", () => ({
  default: vi.fn(() => null),
}));

vi.mock("../../components/LineItemAttachment", () => ({
  default: () => null,
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: {
      is_admin: true,
      modules: [],
      auth: { public_id: "a", username: "admin" },
      user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
      role: null,
      accessible_project_ids: [],
    },
    isLoading: false,
  }),
}));

vi.mock("../../hooks/useViewAttachmentObjectUrl", () => ({
  useViewAttachmentObjectUrl: () => mockUseViewAttachmentObjectUrl(),
}));

vi.mock("./codingSuggestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./codingSuggestion")>();
  return {
    ...actual,
    suggestCoding: (...args: unknown[]) => mockSuggestCoding(...args),
  };
});

const codingSuggestHookCalls: Array<{
  lineUserEditEpoch?: number;
  projectHintForSuggest?: string;
}> = [];

vi.mock("./useBillCodingSuggestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useBillCodingSuggestion")>();
  return {
    useBillCodingSuggestion: (props: Parameters<typeof actual.useBillCodingSuggestion>[0]) => {
      codingSuggestHookCalls.push({
        lineUserEditEpoch: props.lineUserEditEpoch,
        projectHintForSuggest: props.projectHintForSuggest,
      });
      return actual.useBillCodingSuggestion(props);
    },
  };
});

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
    description: "existing",
    quantity: null,
    rate: null,
    amount: "100.00",
    is_billable: true,
    is_billed: null,
    markup: null,
    price: null,
    is_draft: true,
    ...overrides,
  };
}

function lineItemsListResponse(items: BillLineItem[]) {
  return { data: items, count: items.length };
}

/** The one project visible through the UserProject-scoped /get/projects list. */
const VISIBLE_PROJECT = { id: 7, public_id: "p-visible", name: "Visible Project" };
/** A project id deliberately ABSENT from that list — the U-169 scope-invisible case. */
const HIDDEN_PROJECT_ID = 144;

function unresolvedProjectLine(): BillLineItem {
  return sampleLineItem({
    public_id: "li-hidden-proj",
    project_id: HIDDEN_PROJECT_ID,
    description: "scope-invisible project",
  });
}

/**
 * Single mock router for every spec. `/get/projects` always returns ONLY
 * VISIBLE_PROJECT, so the UserProject-scoping premise holds; `lineItems` is
 * passed explicitly (never defaulted) because a fixture whose project_id does
 * not match VISIBLE_PROJECT would silently become an unresolved line.
 */
function setupMocks(lineItems: BillLineItem[]) {
  mockGetOne.mockImplementation((path: string) => {
    if (path === BILL_GET_PATH) {
      return Promise.resolve(sampleBill());
    }
    if (path === "/api/v1/bill/bill-1/intake-prediction") {
      return Promise.reject(new ApiError(404, "Not found"));
    }
    if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
      return Promise.reject(new ApiError(404, "Not found"));
    }
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  mockGetList.mockImplementation((path: string) => {
    if (path === "/api/v1/get/vendors") {
      return Promise.resolve({
        data: [
          { id: 1, public_id: "v-1", name: "V" },
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
        data: [
          { id: 1, public_id: "scc-1", name: "SCC", number: "01" },
          { id: 10, public_id: "scc-pub", name: "Suggested SCC", number: "01-100" },
        ],
        count: 2,
      });
    }
    if (path === "/api/v1/get/projects") {
      return Promise.resolve({ data: [VISIBLE_PROJECT], count: 1 });
    }
    if (path === BILL_LINE_ITEMS_PATH) {
      return Promise.resolve(lineItemsListResponse(lineItems));
    }
    return Promise.reject(new Error(`unexpected getList: ${path}`));
  });

  mockPut.mockImplementation((path: string) => {
    if (path === "/api/v1/update/bill/bill-1") {
      return Promise.resolve(sampleBill({ row_version: "brv-2" }));
    }
    if (path.startsWith("/api/v1/update/bill_line_item/")) {
      const id = path.split("/").pop()!;
      return Promise.resolve({ public_id: id, row_version: "rv-1b" });
    }
    return Promise.reject(new Error(`unexpected put: ${path}`));
  });

  mockPost.mockRejectedValue(new Error("unexpected post"));
  mockDel.mockResolvedValue({});
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function renderBillEdit() {
  act(() => {
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
}

async function mountBillEdit() {
  renderBillEdit();
  await waitForCombobox(container);
}

function findSaveButton(): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Save",
  );
  expect(btn).toBeDefined();
  return btn!;
}

function findAddRowButton(): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "+ Add Line",
  );
  expect(btn).toBeDefined();
  return btn!;
}

function lineItemRows(): HTMLTableRowElement[] {
  return Array.from(container.querySelectorAll("tbody tr")).filter(
    (tr) => !tr.querySelector(".empty-state"),
  ) as HTMLTableRowElement[];
}

function headerBudgetBadge(): Element | null {
  return container.querySelector(".inline-li-header-actions [class*='coding-budget-']");
}

/** flushUntil that fails loudly when the condition never becomes true (r1-6). */
async function flushUntilHard(check: () => boolean, label: string): Promise<void> {
  await flushUntil(check);
  expect(check(), label).toBe(true);
}

function sccCombobox(row: HTMLTableRowElement): Element {
  return row.querySelectorAll("td")[1].querySelector(".bo-combobox")!;
}

function sccValue(row: HTMLTableRowElement): string {
  return getComboboxValue(sccCombobox(row));
}

async function setSccValue(row: HTMLTableRowElement, value: string): Promise<void> {
  await waitForCombobox(sccCombobox(row));
  if (!value) clearCombobox(sccCombobox(row));
  else pickComboboxOptionByValue(sccCombobox(row), value);
}

function projectCombobox(row: HTMLTableRowElement): Element {
  return row.querySelectorAll("td")[2].querySelector(".bo-combobox")!;
}

function projectValue(row: HTMLTableRowElement): string {
  return getComboboxValue(projectCombobox(row));
}

async function setProjectValue(row: HTMLTableRowElement, value: string): Promise<void> {
  await waitForCombobox(projectCombobox(row));
  if (!value) clearCombobox(projectCombobox(row));
  else pickComboboxOptionByValue(projectCombobox(row), value);
}

function descriptionInput(row: HTMLTableRowElement): HTMLInputElement {
  return row.querySelectorAll("td")[0].querySelector("input") as HTMLInputElement;
}

function quantityInput(row: HTMLTableRowElement): HTMLInputElement {
  return row.querySelectorAll("td")[3].querySelector("input") as HTMLInputElement;
}

function rateInput(row: HTMLTableRowElement): HTMLInputElement {
  return row.querySelectorAll("td")[4].querySelector("input") as HTMLInputElement;
}

async function waitForReady() {
  await flushUntil(() => {
    const rows = lineItemRows();
    return rows.length > 0 && descriptionInput(rows[0]).value === "existing";
  });
  // flushUntil returns silently on exhaustion — hard-assert the seeded row landed.
  expect(descriptionInput(lineItemRows()[0]).value).toBe("existing");
}

async function clickSave() {
  await act(async () => {
    findSaveButton().click();
  });
  await flushUntil(() => {
    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Save" || b.textContent?.trim() === "Saving...",
    );
    return btn?.textContent?.trim() === "Save";
  });
  await act(async () => {
    for (let i = 0; i < 40; i++) {
      await Promise.resolve();
    }
  });
}

function postCallsForDescription(desc: string): [string, Record<string, unknown>][] {
  return mockPost.mock.calls.filter(
    (c) =>
      c[0] === "/api/v1/create/bill_line_item" &&
      (c[1] as Record<string, unknown>).description === desc,
  ) as [string, Record<string, unknown>][];
}

function putCallsForLineItem(id: string): [string, Record<string, unknown>][] {
  return mockPut.mock.calls.filter(
    (c) => c[0] === `/api/v1/update/bill_line_item/${id}`,
  ) as [string, Record<string, unknown>][];
}

function billHeaderPutBodies(): Record<string, unknown>[] {
  return mockPut.mock.calls
    .filter((c) => c[0] === "/api/v1/update/bill/bill-1")
    .map((c) => c[1] as Record<string, unknown>);
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetList.mockReset();
  mockGetOne.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
  mockDel.mockReset();
  mockToast.mockClear();
  mockNavigate.mockClear();
  mockSuggestCoding.mockReset();
  mockSuggestCoding.mockResolvedValue(null);
  codingSuggestHookCalls.length = 0;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setupMocks([unresolvedProjectLine()]);

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

// U-172: API service.py:188 ignores null today — explicit project clear does not
// persist server-side yet. This suite pins the CLIENT wire shape only.
describe("BillEdit unresolved project handling (U-169)", () => {
  function findSubmitForReviewButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Submit for Review"),
    );
  }

  function stickyProjectLabel(): string | null {
    const rows = lineItemRows();
    if (!rows.length) return null;
    if (projectValue(rows[0]!) !== "__unresolved_project__") return null;
    return comboboxInput(projectCombobox(rows[0]!)).value;
  }

  async function waitForUnresolvedProjectLoaded() {
    await flushUntil(() => stickyProjectLabel() != null);
    expect(stickyProjectLabel()).toBeDefined();
  }

  beforeEach(() => {
    setupMocks([unresolvedProjectLine()]);
  });

  it("lookup-miss survives a save: PUT body omits project_public_id", async () => {
    await mountBillEdit();
    await waitForUnresolvedProjectLoaded();

    mockPut.mockClear();

    await clickSave();

    const liPuts = putCallsForLineItem("li-hidden-proj");
    expect(liPuts).toHaveLength(1);
    const body = liPuts[0][1];
    expect(body).not.toHaveProperty("project_public_id");
  });

  it("user-cleared project saves null: PUT body has project_public_id === null", async () => {
    await mountBillEdit();
    await waitForUnresolvedProjectLoaded();

    const row = lineItemRows()[0];
    expect(projectValue(row)).toBe("__unresolved_project__");

    await act(async () => {
      await setProjectValue(row, "");
    });

    await flushUntil(() => stickyProjectLabel() == null);
    expect(stickyProjectLabel()).toBeNull();
    expect(projectValue(row)).toBe("");

    mockPut.mockClear();

    await clickSave();

    const liPuts = putCallsForLineItem("li-hidden-proj");
    expect(liPuts).toHaveLength(1);
    expect(liPuts[0][1].project_public_id).toBeNull();
  });

  it("sticky option renders disabled and Submit for Review is enabled", async () => {
    await mountBillEdit();
    await waitForUnresolvedProjectLoaded();

    expect(stickyProjectLabel()).toContain("Project #144");
    act(() => {
      (projectCombobox(lineItemRows()[0]!).querySelector(".bo-combobox-trigger") as HTMLButtonElement)?.click();
    });
    const stickyOpt = Array.from(document.querySelectorAll('[role="option"]')).find((o) =>
      o.textContent?.includes("Project #144"),
    );
    expect(stickyOpt?.getAttribute("data-disabled")).toBe("true");

    const submitBtn = findSubmitForReviewButton();
    expect(submitBtn).toBeDefined();
    expect(submitBtn!.disabled).toBe(false);
  });

  it("a normally-assigned visible project sends its public_id", async () => {
    setupMocks([
      sampleLineItem({
        public_id: "li-visible-proj",
        project_id: VISIBLE_PROJECT.id,
        description: "visible project line",
      }),
    ]);

    await mountBillEdit();

    await flushUntil(() => {
      const rows = lineItemRows();
      if (rows.length === 0) return false;
      return projectValue(rows[0]!) === "p-visible";
    });
    expect(lineItemRows()).toHaveLength(1);
    expect(projectValue(lineItemRows()[0]!)).toBe("p-visible");
    expect(stickyProjectLabel()).toBeNull();

    mockPut.mockClear();

    await clickSave();

    const liPuts = putCallsForLineItem("li-visible-proj");
    expect(liPuts).toHaveLength(1);
    expect(liPuts[0][1].project_public_id).toBe("p-visible");
  });

  it("a line with no project at all sends null", async () => {
    setupMocks([
      sampleLineItem({
        public_id: "li-no-proj",
        project_id: null,
        description: "no project line",
      }),
    ]);

    await mountBillEdit();

    await flushUntil(() => lineItemRows().length === 1);
    expect(lineItemRows()).toHaveLength(1);
    expect(stickyProjectLabel()).toBeNull();
    expect(projectValue(lineItemRows()[0]!)).toBe("");

    mockPut.mockClear();

    await clickSave();

    const liPuts = putCallsForLineItem("li-no-proj");
    expect(liPuts).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(liPuts[0][1], "project_public_id")).toBe(true);
    expect(liPuts[0][1].project_public_id).toBeNull();
  });

  it("unresolved_project_id survives the savedItems write-back across two saves", async () => {
    await mountBillEdit();
    await waitForUnresolvedProjectLoaded();

    mockPut.mockClear();

    await clickSave();
    await clickSave();

    const liPuts = putCallsForLineItem("li-hidden-proj");
    expect(liPuts).toHaveLength(2);
    expect(Object.prototype.hasOwnProperty.call(liPuts[0][1], "project_public_id")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(liPuts[1][1], "project_public_id")).toBe(false);

    expect(stickyProjectLabel()).toBeTruthy();
  });

  it("switching from an unresolved project to a visible one sends the new public_id", async () => {
    await mountBillEdit();
    await waitForUnresolvedProjectLoaded();

    const row = lineItemRows()[0];
    expect(projectValue(row)).toBe("__unresolved_project__");

    await act(async () => {
      await setProjectValue(row, "p-visible");
    });

    await flushUntil(() => stickyProjectLabel() == null);
    expect(stickyProjectLabel()).toBeNull();
    expect(projectValue(row)).toBe("p-visible");

    mockPut.mockClear();

    await clickSave();

    const liPuts = putCallsForLineItem("li-hidden-proj");
    expect(liPuts).toHaveLength(1);
    expect(liPuts[0][1].project_public_id).toBe("p-visible");
  });
});

describe("BillEdit saveAll incremental line-item sync (U-170)", () => {
  beforeEach(() => {
    setupMocks([sampleLineItem()]);
  });

  it("a mid-loop failure leaves state safe to retry", async () => {
    let newBPostAttempts = 0;

    mockPost.mockImplementation((path: string, body: Record<string, unknown>) => {
      if (path !== "/api/v1/create/bill_line_item") {
        return Promise.reject(new Error(`unexpected post: ${path}`));
      }
      if (body.description === "new-A") {
        return Promise.resolve({ public_id: "li-9", row_version: "rv-9" });
      }
      if (body.description === "new-B") {
        newBPostAttempts += 1;
        if (newBPostAttempts === 1) {
          return Promise.reject(new Error("boom"));
        }
        return Promise.resolve({ public_id: "li-10", row_version: "rv-10" });
      }
      return Promise.reject(new Error(`unexpected post body: ${String(body.description)}`));
    });

    await mountBillEdit();
    await waitForReady();

    await act(async () => {
      findAddRowButton().click();
    });
    await flushUntil(() => lineItemRows().length === 2);

    await act(async () => {
      findAddRowButton().click();
    });
    await flushUntil(() => lineItemRows().length === 3);
    expect(lineItemRows()).toHaveLength(3);

    await act(async () => {
      const rows = lineItemRows();
      setInputValue(descriptionInput(rows[1]), "new-A");
      setInputValue(descriptionInput(rows[2]), "new-B");
    });

    expect(descriptionInput(lineItemRows()[1]).value).toBe("new-A");
    expect(descriptionInput(lineItemRows()[2]).value).toBe("new-B");

    await clickSave();
    expect(container.textContent).toContain("boom");

    await clickSave();

    expect(postCallsForDescription("new-A")).toHaveLength(1);

    // The row created in run 1 is adopted, not re-created: it now PUTs under li-9.
    const li9Puts = putCallsForLineItem("li-9");
    expect(li9Puts.map(([, body]) => body.description)).toContain("new-A");

    const li1Puts = putCallsForLineItem("li-1");
    expect(li1Puts.length).toBeGreaterThanOrEqual(2);
    expect(li1Puts[0][1].row_version).toBe("rv-1");
    expect(li1Puts[1][1].row_version).toBe("rv-1b");
    expect(li1Puts[1][1].row_version).not.toBe("rv-1");
  });

  it("commits DELETE progress so a retry does not re-DELETE a gone row", async () => {
    setupMocks([
      sampleLineItem({ public_id: "li-1", description: "line-1", amount: "50.00" }),
      sampleLineItem({
        id: 12,
        public_id: "li-2",
        row_version: "rv-2",
        description: "line-2",
        amount: "50.00",
      }),
    ]);

    let li2PutAttempts = 0;
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1") {
        return Promise.resolve(sampleBill({ row_version: "brv-2" }));
      }
      if (path === "/api/v1/update/bill_line_item/li-2") {
        li2PutAttempts += 1;
        if (li2PutAttempts === 1) {
          return Promise.reject(new Error("li-2 fail"));
        }
        return Promise.resolve({ public_id: "li-2", row_version: "rv-2b" });
      }
      if (path.startsWith("/api/v1/update/bill_line_item/")) {
        const id = path.split("/").pop()!;
        return Promise.resolve({ public_id: id, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 2);
    expect(lineItemRows()).toHaveLength(2);
    expect(descriptionInput(lineItemRows()[0]).value).toBe("line-1");
    expect(descriptionInput(lineItemRows()[1]).value).toBe("line-2");

    const removeButtons = container.querySelectorAll('button[title="Remove"]');
    expect(removeButtons.length).toBe(2);

    await act(async () => {
      removeButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flushUntil(() => lineItemRows().length === 1);
    expect(descriptionInput(lineItemRows()[0]).value).toBe("line-2");

    await clickSave();
    await flushUntil(() => container.textContent?.includes("li-2 fail") ?? false);
    expect(container.textContent).toContain("li-2 fail");

    await clickSave();

    const deleteCalls = mockDel.mock.calls.filter(
      (c) => c[0] === "/api/v1/delete/bill_line_item/li-1",
    );
    expect(deleteCalls).toHaveLength(1);
  });

  it("happy path: one PUT for existing row, one POST for new row, header total summed", async () => {
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/create/bill_line_item") {
        return Promise.resolve({ public_id: "li-new", row_version: "rv-new" });
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });

    await mountBillEdit();
    await waitForReady();

    await act(async () => {
      findAddRowButton().click();
    });

    await flushUntil(() => lineItemRows().length === 2);

    const newRow = lineItemRows()[1];
    await act(async () => {
      setInputValue(descriptionInput(newRow), "added-line");
      setInputValue(quantityInput(newRow), "1");
      setInputValue(rateInput(newRow), "50");
    });

    mockPut.mockClear();
    mockPost.mockClear();
    mockDel.mockClear();

    await clickSave();

    expect(mockDel).not.toHaveBeenCalled();

    const li1Puts = putCallsForLineItem("li-1");
    expect(li1Puts).toHaveLength(1);

    const createPosts = mockPost.mock.calls.filter(
      (c) => c[0] === "/api/v1/create/bill_line_item",
    );
    expect(createPosts).toHaveLength(1);
    expect((createPosts[0][1] as Record<string, unknown>).description).toBe("added-line");

    const headerBodies = billHeaderPutBodies();
    expect(headerBodies).toHaveLength(1);
    expect(headerBodies[0].total_amount).toBe(150);
  });
});

describe("BillEdit shared-attachment re-homing on line delete (U-171)", () => {
  const ATT_ID = 55;

  // Wire the mocks for a bill whose lines carry the given BLIA links.
  // blia: line public_id -> { linkId, attachmentId } (has a link) or null (404, link-free).
  function setup(
    lines: BillLineItem[],
    blia: Record<string, { linkId: string; attachmentId: number | null } | null>,
  ) {
    mockGetOne.mockImplementation((path: string) => {
      if (path === BILL_GET_PATH) return Promise.resolve(sampleBill());
      const m = path.match(
        /^\/api\/v1\/get\/bill-line-item-attachment\/by-bill-line-item\/(.+)$/,
      );
      if (m) {
        const link = blia[m[1]];
        return link
          ? Promise.resolve({ public_id: link.linkId, attachment_id: link.attachmentId })
          : Promise.reject(new ApiError(404, "Not found"));
      }
      if (path === `/api/v1/get/attachment/id/${ATT_ID}`) {
        return Promise.resolve({ public_id: "att-55" });
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });
    mockGetList.mockImplementation((path: string) => {
      if (path === "/api/v1/get/vendors")
        return Promise.resolve({ data: [{ id: 1, public_id: "v-1", name: "V" }], count: 1 });
      if (path === "/api/v1/get/payment-terms")
        return Promise.resolve({ data: [{ id: 1, public_id: "pt-1" }], count: 1 });
      if (path === "/api/v1/get/sub-cost-codes")
        return Promise.resolve({
          data: [{ id: 1, public_id: "scc-1", name: "SCC", number: "01" }],
          count: 1,
        });
      if (path === "/api/v1/get/projects")
        return Promise.resolve({ data: [VISIBLE_PROJECT], count: 1 });
      if (path === BILL_LINE_ITEMS_PATH) return Promise.resolve(lineItemsListResponse(lines));
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1")
        return Promise.resolve(sampleBill({ row_version: "brv-2" }));
      if (path.startsWith("/api/v1/update/bill_line_item/"))
        return Promise.resolve({ public_id: path.split("/").pop()!, row_version: "rv-1b" });
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });
  }

  const twoLines = () => [
    sampleLineItem({ id: 11, public_id: "li-A", project_id: VISIBLE_PROJECT.id, description: "line-A" }),
    sampleLineItem({ id: 12, public_id: "li-B", project_id: VISIBLE_PROJECT.id, description: "line-B" }),
  ];

  async function removeFirstRow() {
    await flushUntil(() => lineItemRows().length === 2);
    const removeButtons = container.querySelectorAll('button[title="Remove"]');
    await act(async () => {
      removeButtons[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushUntil(() => lineItemRows().length === 1);
  }

  const called = (mock: typeof mockPost, p: string) =>
    mock.mock.calls.some((c) => c[0] === p);

  it("re-homes the shared attachment to a surviving line BEFORE deleting the first line (create-before-delete)", async () => {
    setup(twoLines(), { "li-A": { linkId: "blia-A", attachmentId: ATT_ID }, "li-B": null });
    mockPost.mockImplementation((path: string) =>
      path === "/api/v1/create/bill-line-item-attachment"
        ? Promise.resolve({ public_id: "blia-new", attachment_id: ATT_ID })
        : Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    await mountBillEdit();
    await removeFirstRow();
    await clickSave();

    const rehome = mockPost.mock.calls.filter(
      (c) => c[0] === "/api/v1/create/bill-line-item-attachment",
    );
    expect(rehome).toHaveLength(1);
    expect((rehome[0][1] as Record<string, unknown>).bill_line_item_public_id).toBe("li-B");
    expect((rehome[0][1] as Record<string, unknown>).attachment_public_id).toBe("att-55");
    expect(called(mockDel, "/api/v1/delete/bill-line-item-attachment/blia-A")).toBe(true);
    expect(called(mockDel, "/api/v1/delete/bill_line_item/li-A")).toBe(true);

    // create-before-delete: the rehome POST is invoked before the old-link DELETE.
    const postOrder =
      mockPost.mock.invocationCallOrder[
        mockPost.mock.calls.findIndex((c) => c[0] === "/api/v1/create/bill-line-item-attachment")
      ];
    const delOrder =
      mockDel.mock.invocationCallOrder[
        mockDel.mock.calls.findIndex(
          (c) => c[0] === "/api/v1/delete/bill-line-item-attachment/blia-A",
        )
      ];
    expect(postOrder).toBeLessThan(delOrder);
  });

  it("does NOT abort the save when the removed line's link has a null attachment_id (defect a)", async () => {
    setup(twoLines(), { "li-A": { linkId: "blia-A", attachmentId: null }, "li-B": null });
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    await mountBillEdit();
    await removeFirstRow();
    await clickSave();

    expect(called(mockPost, "/api/v1/create/bill-line-item-attachment")).toBe(false);
    expect(called(mockDel, "/api/v1/delete/bill_line_item/li-A")).toBe(true);
    expect(container.textContent).not.toContain("Could not preserve");
  });

  it("drops the old link WITHOUT re-creating when a survivor already holds the same attachment (defect b, retry-safe)", async () => {
    setup(twoLines(), {
      "li-A": { linkId: "blia-A", attachmentId: ATT_ID },
      "li-B": { linkId: "blia-B", attachmentId: ATT_ID },
    });
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    await mountBillEdit();
    await removeFirstRow();
    await clickSave();

    expect(called(mockPost, "/api/v1/create/bill-line-item-attachment")).toBe(false);
    expect(called(mockDel, "/api/v1/delete/bill-line-item-attachment/blia-A")).toBe(true);
    expect(called(mockDel, "/api/v1/delete/bill_line_item/li-A")).toBe(true);
    expect(container.textContent).not.toContain("Could not preserve");
  });

  it("locates the shared attachment on a NON-first line via the in-order probe (not res.data[0])", async () => {
    setup(twoLines(), { "li-A": null, "li-B": { linkId: "blia-B", attachmentId: ATT_ID } });
    mockPost.mockRejectedValue(new Error("unexpected post"));

    await mountBillEdit();
    await flushUntil(() =>
      mockGetOne.mock.calls.some((c) => c[0] === `/api/v1/get/attachment/id/${ATT_ID}`),
    );
    expect(
      mockGetOne.mock.calls.some((c) => c[0] === `/api/v1/get/attachment/id/${ATT_ID}`),
    ).toBe(true);
  });
});

describe("BillEdit item cache reconciliation (U-174)", () => {
  let confirmSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    setupMocks([sampleLineItem()]);
  });

  afterEach(() => {
    confirmSpy?.mockRestore();
  });

  const cachedBill = () => queryClient.getQueryData<Bill>(entityItemKey(BILL_GET_PATH));

  /** Exact-text button lookup that is safe to POLL on — unlike findSaveButton, which
   * hard-asserts and would THROW inside a flushUntil predicate rather than wait while
   * the label still reads "Saving...". */
  const buttonWithText = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === label,
    );

  /** U-152 rule 1 for a textarea: assigning .value updates React's _valueTracker and
   * suppresses onChange, so the edit never reaches state. domEvents.setInputValue can't
   * serve here — its HTMLInputElement prototype setter brand-checks the receiver and
   * throws on a textarea. Folding all three variants into __testutils__ is a follow-up. */
  function setTextareaValue(el: HTMLTextAreaElement, value: string): void {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Stubs PUT so the bill_line_item call HANGS until the returned settle() runs — that
   * parked window is saveAll's line-item loop, where a concurrent auto-save can land.
   * The header response is delegated so each spec supplies only what distinguishes it. */
  function stubPutWithHangingLine(header: () => Promise<Bill>) {
    let resolveLine!: (value: BillLineItem) => void;
    const linePut = new Promise<BillLineItem>((resolve) => {
      resolveLine = resolve;
    });
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1") return header();
      if (path.startsWith("/api/v1/update/bill_line_item/")) return linePut;
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });
    return async function settleLinePut() {
      await act(async () => {
        resolveLine(sampleLineItem({ row_version: "rv-1b" }));
        await linePut;
      });
    };
  }

  it("a successful save seeds the item cache with the fresh bill", async () => {
    await mountBillEdit();
    await waitForReady();

    await flushUntil(() => cachedBill()?.row_version === "brv-1");
    expect(cachedBill()?.row_version).toBe("brv-1");

    await clickSave();

    expect(cachedBill()?.row_version).toBe("brv-2");
  });

  it("declines item-cache seed when a mid-loop auto-save supersedes the saveAll header PUT", async () => {
    let headerPutCount = 0;
    const settleLinePut = stubPutWithHangingLine(() => {
      headerPutCount += 1;
      if (headerPutCount === 1) {
        return Promise.resolve(sampleBill({ row_version: "brv-2" }));
      }
      if (headerPutCount === 2) {
        return Promise.resolve(sampleBill({ row_version: "brv-3", memo: "autosaved mid-loop" }));
      }
      return Promise.reject(new Error(`unexpected header put #${headerPutCount}`));
    });

    await mountBillEdit();
    await waitForReady();

    await act(async () => {
      findSaveButton().click();
    });

    await flushUntil(() => buttonWithText("Saving...") !== undefined);

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    expect(memo).toBeTruthy();
    await act(async () => {
      setTextareaValue(memo, "edited during save");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    // Hard precondition — the spec asserts nothing unless the auto-save really landed.
    await flushUntil(() => billHeaderPutBodies().length >= 2);
    expect(billHeaderPutBodies()).toHaveLength(2);

    await settleLinePut();

    await flushUntil(() => buttonWithText("Save") !== undefined);

    expect(cachedBill()?.row_version).toBe("brv-1");
    expect(mockNavigate).toHaveBeenCalledWith("/bill/list");
  });

  it("seeds the item cache on a normal save even when the line sync is slow enough for React to commit", async () => {
    const settleLinePut = stubPutWithHangingLine(() =>
      Promise.resolve(sampleBill({ row_version: "brv-2" })),
    );

    await mountBillEdit();
    await waitForReady();

    await act(async () => {
      findSaveButton().click();
    });

    // Let React fully COMMIT setForm(row_version) in its own scope before the line PUT
    // settles. That ordering is what made the original rowVersion.read() guard read a
    // stale per-render token and decline — seeding nothing on a perfectly normal save.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    await settleLinePut();

    await flushUntil(() => buttonWithText("Save") !== undefined);

    expect(cachedBill()?.row_version).toBe("brv-2");
    expect(mockNavigate).toHaveBeenCalledWith("/bill/list");
  });

  it("a successful delete removes the item cache entry", async () => {
    confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    await mountBillEdit();
    await waitForReady();

    await flushUntil(() => cachedBill() !== undefined);
    expect(cachedBill()).toBeDefined();

    // 404 the bill AFTER the delete so an active-observer re-subscribe cannot repopulate
    // the entry and turn a missing removeQueries into a false green.
    mockGetOne.mockImplementation((path: string) => {
      if (path === BILL_GET_PATH) {
        return Promise.reject(new ApiError(404, "Not found"));
      }
      if (path === "/api/v1/bill/bill-1/intake-prediction") {
        return Promise.reject(new ApiError(404, "Not found"));
      }
      if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
        return Promise.reject(new ApiError(404, "Not found"));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    const deleteBtn = buttonWithText("Discard draft") ?? buttonWithText("Delete");
    expect(deleteBtn).toBeDefined();

    await act(async () => {
      deleteBtn!.click();
    });

    await flushUntil(() => cachedBill() === undefined);
    expect(cachedBill()).toBeUndefined();
  });
});

describe("BillEdit server-owned field rebase (U-464)", () => {
  /**
   * THE BUG. A review transition writes the parent Bill row (`CreateReview`
   * sets its Status), bumping ROWVERSION. `form` is seeded exactly once
   * (`if (item && !form …)`) and kept the pre-action token, so approving a bill
   * and then clicking Complete returned 409 "Concurrency violation" every time.
   * Reported live on 2026-09-15, twice.
   *
   * ONLY `row_version` and `is_draft` rebase, and only when the freshly-arrived
   * record matches the last-in-sync baseline on every other projected key
   * (U-471). Both are read-only in this form — the user-bound inputs are
   * bill_date, bill_number, due_date, memo, payment_term_public_id and
   * vendor_public_id. That is the property U-460 (reverted) lacked: it re-sent
   * a whole page-load-era body with a fresh token, silently reverting a
   * concurrent editor's changes.
   */
  beforeEach(() => {
    // An ordinary resolvable line — `waitForReady` keys on its description.
    // The file-level default seeds the scope-invisible fixture, which belongs
    // to the U-169 specs.
    setupMocks([sampleLineItem()]);
  });

  const cachedBill = () => queryClient.getQueryData<Bill>(entityItemKey(BILL_GET_PATH));

  it("picks up a row_version bumped by a review action, so the next save is not a 409", async () => {
    await mountBillEdit();
    await waitForReady();

    // What ReviewTimeline's invalidation delivers: the same bill, advanced.
    act(() => {
      queryClient.setQueryData(entityItemKey(BILL_GET_PATH), sampleBill({ row_version: "brv-after-approval" }));
    });
    // Propagation precondition — assert the fresh data actually landed before
    // asserting what the page did with it.
    await flushUntil(() => cachedBill()?.row_version === "brv-after-approval");
    expect(cachedBill()?.row_version).toBe("brv-after-approval");

    await clickSave();

    const bodies = billHeaderPutBodies();
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[bodies.length - 1].row_version).toBe("brv-after-approval");
  });

  it("does NOT overwrite fields the user has typed", async () => {
    /* The U-460 failure, pinned: a rebase that touched editable fields would
       silently revert in-progress work. */
    await mountBillEdit();
    await waitForReady();

    const billNumber = container.querySelector('input[name="bill_number"]') as HTMLInputElement;
    expect(billNumber).toBeTruthy();
    await act(async () => {
      setInputValue(billNumber, "TYPED-BY-USER");
    });

    act(() => {
      queryClient.setQueryData(entityItemKey(BILL_GET_PATH), sampleBill({
        row_version: "brv-after-approval",
        bill_number: "SERVER-VALUE",
        memo: "server memo",
      }));
    });
    await flushUntil(() => cachedBill()?.row_version === "brv-after-approval");

    expect((container.querySelector('input[name="bill_number"]') as HTMLInputElement).value)
      .toBe("TYPED-BY-USER");
  });

  it("refuses a token from a DIFFERENT bill", async () => {
    /* `/bill/:publicId/edit` is one Route, so React reconciles the same
       instance when the param changes and `form` keeps the previous bill's
       values. Taking bill B's valid token under bill A's values is the
       cross-bill corruption the U-460 review verified by probe. */
    await mountBillEdit();
    await waitForReady();

    act(() => {
      queryClient.setQueryData(entityItemKey(BILL_GET_PATH), sampleBill({
        public_id: "a-completely-different-bill",
        row_version: "other-bills-token",
      }));
    });
    await flushUntil(() => cachedBill()?.public_id === "a-completely-different-bill");

    await clickSave();

    const bodies = billHeaderPutBodies();
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[bodies.length - 1].row_version).not.toBe("other-bills-token");
  });

  it("does NOT rebase the token when a co-editor changes memo — banner instead", async () => {
    await mountBillEdit();
    await waitForReady();

    act(() => {
      queryClient.setQueryData(entityItemKey(BILL_GET_PATH), sampleBill({
        row_version: "brv-co-editor",
        memo: "from another window",
      }));
    });
    await flushUntil(() => cachedBill()?.memo === "from another window");
    expect(cachedBill()?.memo).toBe("from another window");

    await flushUntil(() => container.textContent?.includes("This bill was changed in another window.") ?? false);
    expect(container.textContent).toContain("This bill was changed in another window.");
    expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.trim() === "Reload")).toBe(true);

    await clickSave();
    const bodies = billHeaderPutBodies();
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[bodies.length - 1].row_version).toBe("brv-1");
    expect(bodies[bodies.length - 1].row_version).not.toBe("brv-co-editor");
  });

  it("saveAll: an arrival carrying the saved values is NOT diverged", async () => {
    /* flushAutoSave runs autoSaveHeader first. Fail that PUT so only
       saveAll's acceptBaseline can move the baseline — miss it and this
       arrival looks like a co-editor. */
    let headerPuts = 0;
    mockPut.mockImplementation((path: string, body: Record<string, unknown>) => {
      if (path === "/api/v1/update/bill/bill-1") {
        headerPuts += 1;
        if (headerPuts === 1) return Promise.reject(new Error("autosave fail"));
        return Promise.resolve(sampleBill({
          row_version: "brv-after-saveall",
          memo: (body.memo as string | null) ?? "",
        }));
      }
      if (path.startsWith("/api/v1/update/bill_line_item/")) {
        const id = path.split("/").pop()!;
        return Promise.resolve({ public_id: id, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    await mountBillEdit();
    await waitForReady();

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    expect(memo).toBeTruthy();
    await act(async () => {
      setTextareaValue(memo, "saved via saveAll");
    });

    await clickSave();
    expect(billHeaderPutBodies().length).toBeGreaterThan(0);

    act(() => {
      queryClient.setQueryData(entityItemKey(BILL_GET_PATH), sampleBill({
        row_version: "brv-after-saveall",
        memo: "saved via saveAll",
      }));
    });
    await flushUntil(() => cachedBill()?.memo === "saved via saveAll");
    expect(container.textContent).not.toContain("This bill was changed in another window.");
  });

  it("autoSaveHeader: an arrival carrying the saved values is NOT diverged", async () => {
    mockPut.mockImplementation((path: string, body: Record<string, unknown>) => {
      if (path === "/api/v1/update/bill/bill-1") {
        return Promise.resolve(sampleBill({
          row_version: "brv-after-autosave",
          memo: (body.memo as string | null) ?? "",
        }));
      }
      if (path.startsWith("/api/v1/update/bill_line_item/")) {
        const id = path.split("/").pop()!;
        return Promise.resolve({ public_id: id, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    await mountBillEdit();
    await waitForReady();

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(memo, "saved via autosave");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => billHeaderPutBodies().length > 0);
    expect(billHeaderPutBodies().length).toBeGreaterThan(0);

    act(() => {
      queryClient.setQueryData(entityItemKey(BILL_GET_PATH), sampleBill({
        row_version: "brv-after-autosave",
        memo: "saved via autosave",
      }));
    });
    await flushUntil(() => cachedBill()?.memo === "saved via autosave");
    expect(container.textContent).not.toContain("This bill was changed in another window.");
  });

  it("deferred seed: vendors arriving after the bill do not let a co-editor rebase the token", async () => {
    /* P0 — BillEdit's seed waits on fullVendors AND fullPaymentTerms. The
       item GET often wins that race; a lazy [item] capture then either
       never runs (same identity when vendors land) or captures the
       co-editor as "in sync". Hold /get/vendors empty until the bill is
       in cache, then enable the gate, then deliver a co-editor. */
    const prior = mockGetList.getMockImplementation()!;
    mockGetList.mockImplementation((path: string) => {
      if (path === "/api/v1/get/vendors") {
        return Promise.resolve({ data: [], count: 0 });
      }
      return prior(path);
    });

    renderBillEdit();
    await flushUntil(() => cachedBill() !== undefined);
    expect(cachedBill()?.row_version).toBe("brv-1");
    expect(queryClient.getQueryData(entityListKey("/api/v1/get/vendors"))).toEqual({
      data: [],
      count: 0,
    });
    // Gate still closed — the page returns null until it can seed.
    expect(
      Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.trim() === "Save"),
    ).toBe(false);

    act(() => {
      queryClient.setQueryData(entityListKey("/api/v1/get/vendors"), {
        data: [{ id: 1, public_id: "v-1", name: "V" }],
        count: 1,
      });
    });
    await waitForReady();

    act(() => {
      queryClient.setQueryData(entityItemKey(BILL_GET_PATH), sampleBill({
        row_version: "brv-co-editor",
        memo: "from another window",
      }));
    });
    await flushUntil(() => cachedBill()?.memo === "from another window");

    await flushUntil(() => container.textContent?.includes("This bill was changed in another window.") ?? false);
    expect(container.textContent).toContain("This bill was changed in another window.");

    await clickSave();
    const bodies = billHeaderPutBodies();
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[bodies.length - 1].row_version).toBe("brv-1");
    expect(bodies[bodies.length - 1].row_version).not.toBe("brv-co-editor");
  });
});

describe("BillEdit ROWVERSION race with review (U-531)", () => {
  beforeEach(() => {
    setupMocks([sampleLineItem()]);
  });

  afterEach(() => {
    vi.mocked(ReviewTimeline).mockImplementation(() => null);
  });

  const cachedBill = () => queryClient.getQueryData<Bill>(entityItemKey(BILL_GET_PATH));

  const buttonWithText = (label: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === label,
    );

  function stubPutWithHangingLine(header: () => Promise<Bill>) {
    let resolveLine!: (value: BillLineItem) => void;
    const linePut = new Promise<BillLineItem>((resolve) => {
      resolveLine = resolve;
    });
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1") return header();
      if (path.startsWith("/api/v1/update/bill_line_item/")) return linePut;
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });
    return async function settleLinePut() {
      await act(async () => {
        resolveLine(sampleLineItem({ row_version: "rv-1b" }));
        await linePut;
      });
    };
  }

  it("S1: saveAll no-op header PUT raced by review does not poison token or cache", async () => {
    let resolveHeader!: (bill: Bill) => void;
    const headerPut = new Promise<Bill>((resolve) => {
      resolveHeader = resolve;
    });
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1") return headerPut;
      if (path.startsWith("/api/v1/update/bill_line_item/")) {
        const id = path.split("/").pop()!;
        return Promise.resolve({ public_id: id, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    await mountBillEdit();
    await waitForReady();

    const row = lineItemRows()[0];
    await act(async () => {
      setInputValue(descriptionInput(row), "edited line only");
    });

    await act(async () => {
      findSaveButton().click();
    });
    await flushUntil(() => buttonWithText("Saving...") !== undefined);

    await act(async () => {
      queryClient.setQueryData(
        entityItemKey(BILL_GET_PATH),
        sampleBill({ row_version: "brv-after-approval" }),
      );
      resolveHeader(sampleBill({ row_version: "brv-2" }));
      await headerPut;
    });

    await flushUntil(() => buttonWithText("Save") !== undefined);

    expect(cachedBill()?.row_version).toBe("brv-after-approval");

    mockPut.mockClear();
    await clickSave();
    expect(billHeaderPutBodies().length).toBeGreaterThan(0);
    expect(billHeaderPutBodies()[billHeaderPutBodies().length - 1].row_version).toBe(
      "brv-after-approval",
    );
  });

  it("S2: review arrival during saveAll line-item loop does not poison cache", async () => {
    const settleLinePut = stubPutWithHangingLine(() =>
      Promise.resolve(sampleBill({ row_version: "brv-2" })),
    );

    await mountBillEdit();
    await waitForReady();

    const row = lineItemRows()[0];
    await act(async () => {
      setInputValue(descriptionInput(row), "edited during save");
    });

    await act(async () => {
      findSaveButton().click();
    });
    await flushUntil(() => buttonWithText("Saving...") !== undefined);

    act(() => {
      queryClient.setQueryData(
        entityItemKey(BILL_GET_PATH),
        sampleBill({ row_version: "brv-after-approval" }),
      );
    });
    await settleLinePut();

    await flushUntil(() => buttonWithText("Save") !== undefined);

    expect(cachedBill()?.row_version).toBe("brv-after-approval");

    mockPut.mockClear();
    await clickSave();
    expect(billHeaderPutBodies()[billHeaderPutBodies().length - 1].row_version).toBe(
      "brv-after-approval",
    );
  });

  it("concurrent saveAll from Save and review advance shares one in-flight pass", async () => {
    const pendingHeaderPuts: Array<{
      resolve: (bill: Bill) => void;
      promise: Promise<Bill>;
    }> = [];
    let overlappingBillHeaderPuts = false;
    let inFlightBillHeaderPuts = 0;
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1") {
        inFlightBillHeaderPuts += 1;
        if (inFlightBillHeaderPuts > 1) overlappingBillHeaderPuts = true;
        let resolve!: (bill: Bill) => void;
        const promise = new Promise<Bill>((res) => {
          resolve = res;
        });
        pendingHeaderPuts.push({ resolve, promise });
        return promise.finally(() => {
          inFlightBillHeaderPuts -= 1;
        });
      }
      if (path.startsWith("/api/v1/update/bill_line_item/")) {
        const id = path.split("/").pop()!;
        return Promise.resolve({ public_id: id, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    vi.mocked(ReviewTimeline).mockImplementation((props) =>
      createElement(
        "button",
        {
          type: "button",
          "data-testid": "review-advance-stub",
          onClick: async () => {
            if (props.onBeforeAction) {
              await props.onBeforeAction("advance", false);
            }
          },
        },
        "Advance",
      ),
    );

    await mountBillEdit();
    await waitForReady();

    const row = lineItemRows()[0];
    await act(async () => {
      setInputValue(descriptionInput(row), "concurrent edit");
    });

    await act(async () => {
      findSaveButton().click();
    });
    await flushUntil(() => buttonWithText("Saving...") !== undefined);
    await flushUntil(() => pendingHeaderPuts.length > 0);
    expect(pendingHeaderPuts.length).toBe(1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-advance-stub"]')!.click();
    });
    await flushUntil(() => {
      // Without the in-flight gate, review advance starts a second saveAll while the
      // Save-driven header PUT is still unresolved — a second bill header PUT is issued.
      return pendingHeaderPuts.length > 1 || overlappingBillHeaderPuts;
    });
    expect(overlappingBillHeaderPuts).toBe(false);
    expect(pendingHeaderPuts.length).toBe(1);
    expect(
      mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1").length,
    ).toBe(1);

    for (const pending of pendingHeaderPuts) {
      pending.resolve(sampleBill({ row_version: "brv-2" }));
      await act(async () => {
        await pending.promise;
      });
    }
    await flushUntil(() => buttonWithText("Save") !== undefined);

    const linePutBodies = mockPut.mock.calls
      .filter((c) => String(c[0]).startsWith("/api/v1/update/bill_line_item/"))
      .map((c) => c[1] as { description?: string | null });
    expect(linePutBodies.some((b) => b.description === "concurrent edit")).toBe(true);
    expect(container.querySelector(".form-error")).toBeNull();
    expect(overlappingBillHeaderPuts).toBe(false);
  });

  it("S3: autosave with dirty flag but unchanged body, raced by review, does not wedge", async () => {
    let resolveHeader!: (bill: Bill) => void;
    const headerPut = new Promise<Bill>((resolve) => {
      resolveHeader = resolve;
    });
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1") return headerPut;
      if (path.startsWith("/api/v1/update/bill_line_item/")) {
        const id = path.split("/").pop()!;
        return Promise.resolve({ public_id: id, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    await mountBillEdit();
    await waitForReady();

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    expect(memo.value).toBe("");
    await act(async () => {
      setTextareaValue(memo, "x");
      setTextareaValue(memo, "");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"));

    await act(async () => {
      queryClient.setQueryData(
        entityItemKey(BILL_GET_PATH),
        sampleBill({ row_version: "brv-after-approval" }),
      );
      resolveHeader(sampleBill({ row_version: "brv-2" }));
      await headerPut;
    });

    await flushUntil(() => billHeaderPutBodies().length > 0);
    expect(cachedBill()?.row_version).toBe("brv-after-approval");
  });

  it("S4: autosave with a real body change raced by co-editor memo shows divergence banner", async () => {
    let resolveHeader!: (bill: Bill) => void;
    const headerPut = new Promise<Bill>((resolve) => {
      resolveHeader = resolve;
    });
    mockPut.mockImplementation((path: string, body: Record<string, unknown>) => {
      if (path === "/api/v1/update/bill/bill-1") {
        return headerPut.then(() =>
          Promise.resolve(
            sampleBill({
              row_version: "brv-2",
              memo: (body.memo as string | null) ?? "",
            }),
          ),
        );
      }
      if (path.startsWith("/api/v1/update/bill_line_item/")) {
        const id = path.split("/").pop()!;
        return Promise.resolve({ public_id: id, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    await mountBillEdit();
    await waitForReady();

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(memo, "my edit");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"));

    act(() => {
      queryClient.setQueryData(
        entityItemKey(BILL_GET_PATH),
        sampleBill({ row_version: "brv-co-editor", memo: "from another window" }),
      );
    });
    await flushUntil(() => cachedBill()?.memo === "from another window");

    await act(async () => {
      resolveHeader(sampleBill({ row_version: "brv-2", memo: "my edit" }));
      await headerPut;
    });

    await flushUntil(
      () => container.textContent?.includes("This bill was changed in another window.") ?? false,
    );
    expect(container.textContent).toContain("This bill was changed in another window.");
  });
});

const REVIEWS_LIST_PATH = "/api/v1/get/reviews/bill/bill-1";
const REVIEW_SUBMIT_PATH = "/api/v1/submit/review/bill/bill-1";
const REVIEW_ADVANCE_PATH = "/api/v1/advance/review/bill/bill-1";
const SUBMIT_REQUIRES_PROJECT_MSG =
  "Add a line item with a project before submitting for review.";

describe("BillEdit ReviewTimeline onBeforeAction (U-530)", () => {
  function activeReviewRow() {
    return {
      id: 1,
      public_id: "rev-1",
      row_version: "rv",
      created_datetime: null,
      modified_datetime: null,
      review_status_id: 2,
      user_id: 1,
      comments: null,
      bill_id: 1,
      expense_id: null,
      bill_credit_id: null,
      invoice_id: null,
      status_name: "In review",
      status_sort_order: 2,
      status_is_final: false,
      status_is_declined: false,
      status_color: null,
      status_is_initial: false,
      review_kind: "in_review",
      user_firstname: "A",
      user_lastname: "D",
    };
  }

  function wireReviewMocks(lineItems: BillLineItem[], reviews: unknown[] = []) {
    setupMocks(lineItems);
    const priorGetList = mockGetList.getMockImplementation()!;
    mockGetList.mockImplementation((path: string) => {
      if (path === REVIEWS_LIST_PATH) {
        return Promise.resolve({ data: reviews, count: reviews.length });
      }
      return priorGetList(path);
    });
    mockPost.mockImplementation((path: string) => {
      if (path === REVIEW_SUBMIT_PATH || path === REVIEW_ADVANCE_PATH) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });
  }

  beforeEach(() => {
    vi.mocked(ReviewTimeline).mockImplementation((props) =>
        createElement(
          "div",
          null,
          createElement(
            "button",
            {
              type: "button",
              "data-testid": "review-submit-stub",
              onClick: async () => {
                if (props.onBeforeAction) {
                  const ok = await props.onBeforeAction("submit", true);
                  if (!ok) return;
                }
                await mockPost(REVIEW_SUBMIT_PATH, { comments: null });
                props.onAfterSubmit?.();
              },
            },
            "Submit for Review",
          ),
          createElement(
            "button",
            {
              type: "button",
              "data-testid": "review-decline-stub",
              onClick: async () => {
                if (props.onBeforeAction) {
                  const ok = await props.onBeforeAction("decline", false);
                  if (!ok) return;
                }
                await mockPost("/api/v1/decline/review/bill/bill-1", { comments: "no" });
              },
            },
            "Decline",
          ),
          createElement(
            "button",
            {
              type: "button",
              "data-testid": "review-advance-stub",
              onClick: async () => {
                if (props.onBeforeAction) {
                  const ok = await props.onBeforeAction("advance", false);
                  if (!ok) return;
                }
                await mockPost(REVIEW_ADVANCE_PATH, { comments: null });
              },
            },
            "Advance",
          ),
        ),
    );
  });

  afterEach(() => {
    vi.mocked(ReviewTimeline).mockImplementation(() => null);
  });

  it("ReviewTimeline submit with no project does not POST review and tells the user why", async () => {
    wireReviewMocks([
      sampleLineItem({
        public_id: "li-no-proj",
        project_id: null,
        description: "no project",
      }),
    ]);

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-submit-stub"]')!.click();
    });
    await flushUntil(() => mockToast.mock.calls.length > 0);

    expect(mockPost.mock.calls.some((c) => c[0] === REVIEW_SUBMIT_PATH)).toBe(false);
    expect(mockToast).toHaveBeenCalledWith(SUBMIT_REQUIRES_PROJECT_MSG);
    expect(mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1")).toBe(false);
  });

  it("ReviewTimeline submit runs saveAll before POSTing review when a project is present", async () => {
    wireReviewMocks([sampleLineItem({ public_id: "li-proj", description: "with project" })]);

    await mountBillEdit();
    await flushUntil(() => {
      const rows = lineItemRows();
      return rows.length > 0 && descriptionInput(rows[0]).value === "with project";
    });
    expect(descriptionInput(lineItemRows()[0]).value).toBe("with project");

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(memo, "pending memo");
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-submit-stub"]')!.click();
    });
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === REVIEW_SUBMIT_PATH));

    const headerPutIdx = mockPut.mock.calls.findIndex((c) => c[0] === "/api/v1/update/bill/bill-1");
    const reviewIdx = mockPost.mock.calls.findIndex((c) => c[0] === REVIEW_SUBMIT_PATH);
    expect(headerPutIdx).toBeGreaterThanOrEqual(0);
    expect(reviewIdx).toBeGreaterThanOrEqual(0);
    expect(mockPut.mock.invocationCallOrder[headerPutIdx]!).toBeLessThan(
      mockPost.mock.invocationCallOrder[reviewIdx]!,
    );
    const headerBody = mockPut.mock.calls[headerPutIdx]![1] as Record<string, unknown>;
    expect(headerBody.memo).toBe("pending memo");
  });

  it("ReviewTimeline advance still saveAlls without the submit-only project gate", async () => {
    wireReviewMocks(
      [
        sampleLineItem({
          public_id: "li-no-proj",
          project_id: null,
          description: "no project",
        }),
      ],
      [activeReviewRow()],
    );

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-advance-stub"]')!.click();
    });
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === REVIEW_ADVANCE_PATH));

    expect(mockPost.mock.calls.some((c) => c[0] === REVIEW_ADVANCE_PATH)).toBe(true);
    expect(mockToast).not.toHaveBeenCalledWith(SUBMIT_REQUIRES_PROJECT_MSG);
    expect(mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1")).toBe(true);
  });

  it("U-676k review submit and advance save prefilled lines as accepted", async () => {
    wireReviewMocks(
      [
        sampleLineItem({
          public_id: "li-pre",
          description: "pre-filled",
          coding_prefill_state: "prefilled",
          sub_cost_code_id: 10,
          project_id: 1,
        }),
      ],
      [activeReviewRow()],
    );
    mockPost.mockImplementation(() => Promise.resolve({}));

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-submit-stub"]')!.click();
    });
    await flushUntil(() =>
      mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill_line_item/li-pre"),
    );
    const linePut = mockPut.mock.calls.find(
      (c) => c[0] === "/api/v1/update/bill_line_item/li-pre",
    );
    expect((linePut![1] as Record<string, unknown>).coding_prefill_state).toBe("accepted");

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-decline-stub"]')!.click();
    });
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === "/api/v1/decline/review/bill/bill-1"));
    expect(mockPost.mock.calls.some((c) => c[0] === "/api/v1/decline/review/bill/bill-1")).toBe(true);
  });

  it("U-676k review decline saveAll keeps prefilled on line PUTs", async () => {
    wireReviewMocks(
      [
        sampleLineItem({
          public_id: "li-pre",
          description: "pre-filled",
          coding_prefill_state: "prefilled",
          sub_cost_code_id: 10,
          project_id: 1,
        }),
      ],
      [activeReviewRow()],
    );
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/decline/review/bill/bill-1") {
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-decline-stub"]')!.click();
    });
    await flushUntil(() =>
      mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill_line_item/li-pre"),
    );
    const linePut = mockPut.mock.calls.find(
      (c) => c[0] === "/api/v1/update/bill_line_item/li-pre",
    );
    expect((linePut![1] as Record<string, unknown>).coding_prefill_state).toBe("prefilled");
  });

  it("U-676k submit-intent saveAll after in-flight draft Save sends accepted before review advance", async () => {
    wireReviewMocks(
      [
        sampleLineItem({
          public_id: "li-pre",
          description: "pre-filled",
          coding_prefill_state: "prefilled",
          sub_cost_code_id: 10,
          project_id: 1,
        }),
      ],
      [activeReviewRow()],
    );
    const callOrder: string[] = [];
    let releaseLinePut!: () => void;
    const linePutGate = new Promise<void>((resolve) => {
      releaseLinePut = resolve;
    });
    const priorPost = mockPost.getMockImplementation();
    mockPut.mockImplementation((path: string, body?: unknown) => {
      if (path === "/api/v1/update/bill/bill-1") {
        return Promise.resolve(sampleBill({ row_version: "brv-2" }));
      }
      if (path === "/api/v1/update/bill_line_item/li-pre") {
        callOrder.push(`line:${(body as { coding_prefill_state?: string })?.coding_prefill_state}`);
        return linePutGate.then(() =>
          Promise.resolve({ public_id: "li-pre", row_version: "lrv-2" }),
        );
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });
    mockPost.mockImplementation((path: string, ...args: unknown[]) => {
      if (path === REVIEW_ADVANCE_PATH) {
        callOrder.push("advance");
      }
      return priorPost!(path, ...args);
    });

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 1);

    await act(async () => {
      findSaveButton().click();
    });
    await flushUntil(
      () =>
        Array.from(container.querySelectorAll("button")).some(
          (b) => b.textContent?.trim() === "Saving...",
        ),
    );
    await flushUntil(() =>
      mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill_line_item/li-pre"),
    );
    expect(
      mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill_line_item/li-pre").length,
    ).toBe(1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-advance-stub"]')!.click();
    });

    await act(async () => {
      releaseLinePut();
    });
    await flushUntilHard(
      () =>
        mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill_line_item/li-pre").length >=
          2 && mockPost.mock.calls.some((c) => c[0] === REVIEW_ADVANCE_PATH),
      "advance after submit-intent line save",
    );

    const linePuts = mockPut.mock.calls.filter(
      (c) => c[0] === "/api/v1/update/bill_line_item/li-pre",
    );
    expect((linePuts[0]![1] as Record<string, unknown>).coding_prefill_state).toBe("prefilled");
    expect((linePuts[1]![1] as Record<string, unknown>).coding_prefill_state).toBe("accepted");
    expect(callOrder.indexOf("line:accepted")).toBeLessThan(callOrder.indexOf("advance"));
  });

  it("U-676k Submit for Review and Complete Bill stay enabled with untouched pre-fill", async () => {
    wireReviewMocks([sampleLineItem({ public_id: "li-pre", description: "pre-filled", coding_prefill_state: "prefilled" })]);

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 1);

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"));
    const submit = buttons.find((b) => b.textContent === "Submit for Review" && !b.dataset.testid);
    const complete = buttons.find((b) => b.textContent === "Complete Bill");
    expect(submit!.disabled).toBe(false);
    expect(complete!.disabled).toBe(false);
    expect(container.querySelector(".btn-coding-accept")).toBeNull();
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (b) => b.textContent?.trim() === "Accept all suggestions",
      ),
    ).toBe(false);
  });

  it("passes onBeforeAction to ReviewTimeline", async () => {
    wireReviewMocks([sampleLineItem()]);

    await mountBillEdit();
    await waitForReady();

    expect(ReviewTimeline).toHaveBeenCalled();
    const lastProps = vi.mocked(ReviewTimeline).mock.calls.at(-1)![0];
    expect(typeof lastProps.onBeforeAction).toBe("function");
  });

  it("decline is not blocked when reviews list fetch fails (fail-open submit gate)", async () => {
    wireReviewMocks(
      [
        sampleLineItem({
          public_id: "li-no-proj",
          project_id: null,
          description: "no project",
        }),
      ],
      [activeReviewRow()],
    );
    const priorGetList = mockGetList.getMockImplementation()!;
    mockGetList.mockImplementation((path: string) => {
      if (path === REVIEWS_LIST_PATH) {
        return Promise.reject(new Error("reviews unavailable"));
      }
      return priorGetList(path);
    });
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/decline/review/bill/bill-1") {
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 1);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-decline-stub"]')!.click();
    });
    await flushUntil(() =>
      mockPost.mock.calls.some((c) => c[0] === "/api/v1/decline/review/bill/bill-1"),
    );

    expect(mockToast).not.toHaveBeenCalledWith(SUBMIT_REQUIRES_PROJECT_MSG);
    expect(mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1")).toBe(true);
  });

  it("beforeReviewAction does not re-fetch reviews on advance", async () => {
    wireReviewMocks(
      [sampleLineItem({ public_id: "li-proj", description: "with project" })],
      [activeReviewRow()],
    );

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length > 0);

    const reviewsCallsBefore = mockGetList.mock.calls.filter((c) => c[0] === REVIEWS_LIST_PATH)
      .length;

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-advance-stub"]')!.click();
    });
    await flushUntil(() => mockPost.mock.calls.some((c) => c[0] === REVIEW_ADVANCE_PATH));

    const reviewsCallsAfter = mockGetList.mock.calls.filter((c) => c[0] === REVIEWS_LIST_PATH)
      .length;
    expect(reviewsCallsAfter).toBe(reviewsCallsBefore);
  });
});

function codingSuggestionPayloadEdit() {
  return {
    project_public_id: "p-visible",
    project_name: "Visible Project",
    sub_cost_code_public_id: "scc-pub",
    sub_cost_code_number: "01-100",
    sub_cost_code_name: "Suggested SCC",
    source: "vendor_history" as const,
    reason: "Vendor pattern",
    confidence: 0.72,
    model_version: "v1",
    budget_check: null,
    budget_remaining: null,
  };
}

describe("BillEdit coding suggestions", () => {
  it("tabbing through vendor and empty line pickers does not block later coding suggest", async () => {
    // Hold the on-load suggestion open, tab through the pickers while it is pending, then
    // deliver it: a tab-through that marked the line touched would make it skip the fill.
    let deliver: ((v: unknown) => void) | undefined;
    mockSuggestCoding.mockImplementation(
      () =>
        new Promise((resolve) => {
          deliver = resolve;
        }),
    );
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: null,
        description: "line",
      }),
    ]);
    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await flushUntilHard(() => deliver !== undefined, "on-load coding suggest is in flight");

    const row = lineItemRows()[0]!;
    expect(sccValue(row)).toBe("");
    expect(getComboboxValue(projectCombobox(row))).toBe("");

    const callsBeforeTab = mockSuggestCoding.mock.calls.length;
    const vendorField = container.querySelector('[data-bo-field="vendor_public_id"]')!;
    await act(async () => {
      tabAwayFromCombobox(vendorField);
      tabAwayFromCombobox(sccCombobox(row));
      tabAwayFromCombobox(projectCombobox(row));
    });
    expect(mockSuggestCoding.mock.calls.length).toBe(callsBeforeTab);

    await act(async () => {
      deliver!(codingSuggestionPayloadEdit());
    });
    await flushUntilHard(
      () => sccValue(row) === "10",
      "suggestion still fills the tabbed-through line (not marked touched)",
    );
  });

  it("prefills empty coding cells and shows Suggested badge on draft bills", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: null,
        description: "",
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");

    await flushUntilHard(
      () => container.querySelector(".status-badge.coding-suggested") !== null,
      "suggestion badge visible",
    );

    const row = lineItemRows()[0];
    expect(sccValue(row)).toBe("10");
    expect(projectValue(row)).toBe("");
    expect(mockSuggestCoding).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_public_id: "v-1",
        bill_public_id: "bill-1",
      }),
    );
    expect(mockSuggestCoding.mock.calls[0][0]).not.toHaveProperty("amount");
  });

  it("r4-1 first suggest after load uses saved memo and fires exactly once", async () => {
    mockSuggestCoding.mockResolvedValue(null);
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: null,
      }),
    ]);
    mockGetOne.mockImplementation((path: string) => {
      if (path === BILL_GET_PATH) {
        return Promise.resolve(sampleBill({ memo: "Lumber 2x4" }));
      }
      if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
        return Promise.reject(new ApiError(404, "Not found"));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 1, "suggest after load");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockSuggestCoding).toHaveBeenCalledTimes(1);
    expect(mockSuggestCoding.mock.calls[0][0]).toEqual(
      expect.objectContaining({ memo: "Lumber 2x4" }),
    );
  });

  it("r5-7 BillEdit loads draft with saved memo and covered lines: one request with amount and header chip", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayloadEdit(),
      budget_check: "fits" as const,
      budget_remaining: "500.00",
    });
    setupMocks([
      sampleLineItem({
        public_id: "li-a",
        sub_cost_code_id: null,
        project_id: VISIBLE_PROJECT.id,
        amount: "60.00",
        quantity: 1,
        rate: "60.00",
      }),
      sampleLineItem({
        public_id: "li-b",
        sub_cost_code_id: null,
        project_id: VISIBLE_PROJECT.id,
        amount: "40.00",
        quantity: 1,
        rate: "40.00",
      }),
    ]);
    mockGetOne.mockImplementation((path: string) => {
      if (path === BILL_GET_PATH) {
        return Promise.resolve(sampleBill({ memo: "Lumber 2x4" }));
      }
      if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
        return Promise.reject(new ApiError(404, "Not found"));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 2, "lines loaded");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntilHard(() => mockSuggestCoding.mock.calls.length === 1, "single suggest");
    expect(mockSuggestCoding.mock.calls[0][0]).toEqual(
      expect.objectContaining({ memo: "Lumber 2x4", amount: "100.00" }),
    );
    await flushUntilHard(() => headerBudgetBadge() !== null, "header budget chip");
    expect(lineItemRows()[0].querySelector("[class*='coding-budget-']")).toBeNull();
  });

  it("r6-1 BillEdit load with 600 ms deferred response fills SCC, shows chip, one request", async () => {
    let resolveSlow!: (value: ReturnType<typeof codingSuggestionPayloadEdit>) => void;
    mockSuggestCoding.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSlow = resolve;
        }),
    );
    setupMocks([
      sampleLineItem({
        public_id: "li-a",
        sub_cost_code_id: null,
        project_id: VISIBLE_PROJECT.id,
        amount: "100.00",
        quantity: 1,
        rate: "100.00",
      }),
    ]);
    mockGetOne.mockImplementation((path: string) => {
      if (path === BILL_GET_PATH) {
        return Promise.resolve(sampleBill({ memo: "Saved memo" }));
      }
      if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
        return Promise.reject(new ApiError(404, "Not found"));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "lines loaded");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(mockSuggestCoding).toHaveBeenCalledTimes(1);
    expect(sccValue(lineItemRows()[0])).toBe("");
    expect(headerBudgetBadge()).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await act(async () => {
      resolveSlow({
        ...codingSuggestionPayloadEdit(),
        budget_check: "fits",
        budget_remaining: "25.00",
      } as unknown as ReturnType<typeof codingSuggestionPayloadEdit>);
      await Promise.resolve();
    });
    await flushUntilHard(() => sccValue(lineItemRows()[0]) === "10", "SCC prefilled");
    await flushUntilHard(() => headerBudgetBadge() !== null, "header budget chip");
    expect(container.textContent).toContain("Within budget");
    expect(mockSuggestCoding).toHaveBeenCalledTimes(1);
  });

  it("r6-4 clearing line 0 project while line 1 stays on p-visible keeps hint and chip", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayloadEdit(),
      budget_check: "fits" as const,
      budget_remaining: "50.00",
    });
    setupMocks([
      sampleLineItem({
        public_id: "li-a",
        sub_cost_code_id: null,
        project_id: VISIBLE_PROJECT.id,
        amount: "60.00",
        quantity: 1,
        rate: "60.00",
      }),
      sampleLineItem({
        public_id: "li-b",
        sub_cost_code_id: null,
        project_id: VISIBLE_PROJECT.id,
        amount: "40.00",
        quantity: 1,
        rate: "40.00",
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 2, "lines loaded");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntilHard(() => headerBudgetBadge() !== null, "chip before clear");

    await act(async () => {
      await setProjectValue(lineItemRows()[0], "");
    });
    expect(headerBudgetBadge()).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntilHard(() => headerBudgetBadge() !== null, "chip after clear line 0");
    expect(container.textContent).toContain("Within budget");
    expect(mockSuggestCoding.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ amount: "40.00", project_public_id: "p-visible" }),
    );
  });

  it("shows budget chip in line items header and sends eligible line amount", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayloadEdit(),
      budget_check: "fits" as const,
      budget_remaining: "500.00",
    });
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: VISIBLE_PROJECT.id,
        description: "",
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await flushUntilHard(
      () => container.querySelector(".status-badge.coding-suggested") !== null,
      "suggestion badge visible",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(container.textContent).toContain("Within budget");
    expect(headerBudgetBadge()).not.toBeNull();
    expect(mockSuggestCoding.mock.calls[0][0]).toEqual(
      expect.objectContaining({ amount: "100.00" }),
    );
  });

  it("r4-3 sends hint-project line sum as amount and refreshes amount on memo suggest", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayloadEdit(),
      budget_check: "fits" as const,
      budget_remaining: "400.00",
    });
    setupMocks([
      sampleLineItem({
        public_id: "li-a",
        sub_cost_code_id: null,
        project_id: VISIBLE_PROJECT.id,
        amount: "100.00",
        quantity: 1,
        rate: "100.00",
      }),
      sampleLineItem({
        public_id: "li-b",
        sub_cost_code_id: null,
        project_id: null,
        amount: "900.00",
        description: "no project",
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 2, "lines loaded");
    await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 1, "initial suggest");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(mockSuggestCoding.mock.calls[0][0]).toEqual(
      expect.objectContaining({ amount: "100.00" }),
    );
    expect(headerBudgetBadge()).not.toBeNull();
    expect(lineItemRows()[1].querySelector("[class*='coding-budget-']")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const callsBefore = mockSuggestCoding.mock.calls.length;
    const rateInput = lineItemRows()[0].querySelectorAll("td")[4].querySelector(
      "input",
    ) as HTMLInputElement;
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(rateInput, "150");
      setTextareaValue(memo, "revised memo");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntilHard(
      () => mockSuggestCoding.mock.calls.length === callsBefore + 1,
      "memo suggest with new amount",
    );
    expect(mockSuggestCoding.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ amount: "150.00", memo: "revised memo" }),
    );
  });

  it("r4-2 project change keeps prefilled state, badge, and draft save", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: null,
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line loaded");
    await flushUntilHard(
      () => container.querySelector(".status-badge.coding-suggested") !== null,
      "SCC badge visible",
    );

    await act(async () => {
      await setProjectValue(lineItemRows()[0], "p-visible");
    });
    expect(container.querySelector(".status-badge.coding-suggested")).not.toBeNull();

    await act(async () => {
      findSaveButton().click();
    });
    await flushUntilHard(
      () => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill_line_item/li-empty"),
      "line saved",
    );
    const linePut = mockPut.mock.calls.find(
      (c) => c[0] === "/api/v1/update/bill_line_item/li-empty",
    );
    expect((linePut![1] as Record<string, unknown>).coding_prefill_state).toBe("prefilled");
  });

  it("r1-6 does not call suggestCoding on non-draft bills", async () => {
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: null,
      }),
    ]);
    mockGetOne.mockImplementation((path: string) => {
      if (path === BILL_GET_PATH) {
        return Promise.resolve(sampleBill({ is_draft: false }));
      }
      if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
        return Promise.reject(new ApiError(404, "Not found"));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockSuggestCoding).not.toHaveBeenCalled();
  });

  it("does not overwrite user-entered sub cost code", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
    setupMocks([
      sampleLineItem({
        public_id: "li-user-scc",
        sub_cost_code_id: 1,
        project_id: null,
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 1, "suggestCoding invoked");

    const row = lineItemRows()[0];
    expect(sccValue(row)).toBe("1");
    expect(projectValue(row)).toBe("");
  });

  it("U-676k manual Save sends prefilled; Submit for Review sends accepted", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: 10,
        project_id: VISIBLE_PROJECT.id,
        coding_prefill_state: "prefilled",
      }),
    ]);
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/submit/review/bill/bill-1") {
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 1);

    await act(async () => {
      findSaveButton().click();
    });

    await flushUntil(() =>
      mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill_line_item/li-empty"),
    );
    let linePut = mockPut.mock.calls.find(
      (c) => c[0] === "/api/v1/update/bill_line_item/li-empty",
    );
    expect((linePut![1] as Record<string, unknown>).coding_prefill_state).toBe("prefilled");

    mockPut.mockClear();

    const submitBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Submit for Review" && !b.dataset.testid,
    )!;
    await flushUntil(() => !submitBtn.disabled);
    await act(async () => {
      submitBtn.click();
    });
    await flushUntilHard(
      () =>
        mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill_line_item/li-empty") &&
        mockPost.mock.calls.some((c) => c[0] === "/api/v1/submit/review/bill/bill-1"),
      "submit flushed accepted prefill",
    );
    linePut = mockPut.mock.calls.find((c) => c[0] === "/api/v1/update/bill_line_item/li-empty");
    expect((linePut![1] as Record<string, unknown>).coding_prefill_state).toBe("accepted");
  });

  it("U-676k header autosave issues no line PUT and keeps prefilled server-side", async () => {
    vi.useFakeTimers();
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
    setupMocks([
      sampleLineItem({
        public_id: "li-pre",
        sub_cost_code_id: 10,
        project_id: VISIBLE_PROJECT.id,
        coding_prefill_state: "prefilled",
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    mockPut.mockClear();

    const memo = container.querySelector("textarea");
    expect(memo).toBeTruthy();
    await act(async () => {
      setTextareaValue(memo!, "autosaved memo tweak");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await flushUntil(() =>
      mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"),
    );
    expect(
      mockPut.mock.calls.some((c) => String(c[0]).startsWith("/api/v1/update/bill_line_item/")),
    ).toBe(false);
    vi.useRealTimers();
  });

  it("U-676k Complete sends accepted on line PUTs before POST /complete/bill", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const callOrder: string[] = [];
    setupMocks([
      sampleLineItem({
        public_id: "li-pre",
        description: "pre-filled",
        coding_prefill_state: "prefilled",
        sub_cost_code_id: 10,
        project_id: 1,
      }),
    ]);
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1") {
        return Promise.resolve(sampleBill({ row_version: "brv-2" }));
      }
      if (path === "/api/v1/update/bill_line_item/li-pre") {
        callOrder.push("line-put");
        return Promise.resolve({ public_id: "li-pre", row_version: "lrv-2" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/complete/bill/bill-1") {
        callOrder.push("complete");
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 1);

    const completeBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Complete Bill",
    )!;
    await act(async () => {
      completeBtn.click();
    });
    await flushUntilHard(
      () =>
        callOrder.includes("line-put") && callOrder.includes("complete"),
      "complete after accepted line save",
    );
    expect(callOrder.indexOf("line-put")).toBeLessThan(callOrder.indexOf("complete"));
    const linePut = mockPut.mock.calls.find(
      (c) => c[0] === "/api/v1/update/bill_line_item/li-pre",
    );
    expect((linePut![1] as Record<string, unknown>).coding_prefill_state).toBe("accepted");
  });

  it("sends coding_prefill_state changed when user edits prefilled project", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: null,
      }),
    ]);

    await mountBillEdit();
    await flushUntil(() => lineItemRows().length === 1);
    await flushUntil(() => sccValue(lineItemRows()[0]) === "10");

    await act(async () => {
      await setProjectValue(lineItemRows()[0], "p-visible");
    });

    await act(async () => {
      await setSccValue(lineItemRows()[0], "1");
    });

    await flushUntil(() => sccValue(lineItemRows()[0]) === "1");

    await act(async () => {
      findSaveButton().click();
    });

    await flushUntil(() =>
      mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill_line_item/li-empty"),
    );
    const linePut = mockPut.mock.calls.find(
      (c) => c[0] === "/api/v1/update/bill_line_item/li-empty",
    );
    expect((linePut![1] as Record<string, unknown>).coding_prefill_state).toBe("changed");
  });

  it("r1-1 user clear wins when a deferred suggestion response arrives", async () => {
    mockSuggestCoding.mockResolvedValueOnce(codingSuggestionPayloadEdit());
    let resolveSecond!: (value: ReturnType<typeof codingSuggestionPayloadEdit>) => void;
    mockSuggestCoding.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );

    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: null,
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await flushUntilHard(() => sccValue(lineItemRows()[0]) === "10", "first prefill");

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(memo, "trigger second suggest");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 2, "second suggest started");

    const row = lineItemRows()[0];
    await act(async () => {
      await setSccValue(row, "");
    });
    await flushUntilHard(() => sccValue(row) === "", "user cleared SCC");

    await act(async () => {
      resolveSecond(codingSuggestionPayloadEdit());
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 2, "second suggest settled");

    expect(sccValue(row)).toBe("");
  });

  it("r1-2 does not prefill project or SCC on unresolved_project_id lines", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
    setupMocks([
      sampleLineItem({
        public_id: "li-hidden-proj",
        sub_cost_code_id: null,
        project_id: HIDDEN_PROJECT_ID,
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 1, "suggestCoding invoked");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const row = lineItemRows()[0];
    expect(sccValue(row)).toBe("");
    expect(projectValue(row)).toBe("__unresolved_project__");
  });

  it("r2-P after reload editing held SCC on accepted line saves changed", async () => {
    mockSuggestCoding.mockResolvedValue(null);
    setupMocks([
      sampleLineItem({
        public_id: "li-accepted",
        sub_cost_code_id: 10,
        project_id: null,
        coding_prefill_state: "accepted",
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    expect(container.querySelector(".status-badge.coding-suggested")).toBeNull();
    expect(container.querySelector("[class*='coding-budget-']")).toBeNull();

    const row = lineItemRows()[0];
    expect(sccValue(row)).toBe("10");

    await act(async () => {
      await setSccValue(row, "1");
    });
    await flushUntilHard(() => sccValue(row) === "1", "SCC edited");

    await act(async () => {
      findSaveButton().click();
    });
    await flushUntilHard(
      () => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill_line_item/li-accepted"),
      "line saved",
    );
    const linePut = mockPut.mock.calls.find(
      (c) => c[0] === "/api/v1/update/bill_line_item/li-accepted",
    );
    expect((linePut![1] as Record<string, unknown>).coding_prefill_state).toBe("changed");
  });

  it("r2-P after reload no Suggested badge on manually entered SCC", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
    setupMocks([
      sampleLineItem({
        public_id: "li-manual-scc",
        sub_cost_code_id: 1,
        project_id: VISIBLE_PROJECT.id,
        coding_prefill_state: "accepted",
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(container.querySelector(".status-badge.coding-suggested")).toBeNull();
    expect(container.querySelector("[class*='coding-budget-']")).toBeNull();
    expect(sccValue(lineItemRows()[0])).toBe("1");
  });

  it("r1-2 hides budget chip after editing line amount from a visible chip", async () => {
    mockSuggestCoding.mockResolvedValue({
      ...codingSuggestionPayloadEdit(),
      budget_check: "fits" as const,
      budget_remaining: "500.00",
    });
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: VISIBLE_PROJECT.id,
        amount: "100.00",
        quantity: 1,
        rate: "100.00",
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntilHard(() => headerBudgetBadge() !== null, "budget chip visible");
    expect(container.textContent).toContain("Within budget");

    const row = lineItemRows()[0];
    const rateInput = row.querySelectorAll("td")[4].querySelector("input") as HTMLInputElement;
    await act(async () => {
      setInputValue(rateInput, "2000");
    });

    await flushUntilHard(() => headerBudgetBadge() === null, "budget chip hidden after amount edit");
    expect(container.textContent).not.toContain("Within budget");
  });

  it("r1-5 clears budget chip when vendor change yields null suggest", async () => {
    mockSuggestCoding
      .mockResolvedValueOnce({
        ...codingSuggestionPayloadEdit(),
        budget_check: "fits" as const,
        budget_remaining: "500.00",
      })
      .mockResolvedValueOnce(null);
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: VISIBLE_PROJECT.id,
        amount: "100.00",
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntilHard(() => headerBudgetBadge() !== null, "budget chip visible");

    await act(async () => {
      pickComboboxOptionByValue(
        container.querySelector('[data-bo-field="vendor_public_id"]')!,
        "v-2",
      );
    });
    await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 2, "second suggest");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await flushUntilHard(() => headerBudgetBadge() === null, "budget chip cleared");
    expect(container.textContent).not.toContain("Within budget");
  });

  it("r1-4 passes loaded project as hint when line has project and empty SCC", async () => {
    mockSuggestCoding.mockResolvedValue(null);
    setupMocks([
      sampleLineItem({
        public_id: "li-proj-a",
        sub_cost_code_id: null,
        project_id: VISIBLE_PROJECT.id,
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 1, "suggestCoding invoked");

    expect(mockSuggestCoding).toHaveBeenCalledWith(
      expect.objectContaining({
        project_public_id: "p-visible",
      }),
    );
  });

  it("r3-4 debounces memo: five keystrokes within 400ms yield one suggest call after debounce", async () => {
    mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
    setupMocks([
      sampleLineItem({
        public_id: "li-empty",
        sub_cost_code_id: null,
        project_id: null,
      }),
    ]);

    await mountBillEdit();
    await flushUntilHard(() => lineItemRows().length === 1, "line items loaded");
    await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 1, "initial suggest");
    const callsAfterLoad = mockSuggestCoding.mock.calls.length;

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(memo, "a");
      setTextareaValue(memo, "ab");
      setTextareaValue(memo, "abc");
      setTextareaValue(memo, "abcd");
      setTextareaValue(memo, "abcde");
    });
    expect(mockSuggestCoding.mock.calls.length).toBe(callsAfterLoad);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntilHard(
      () => mockSuggestCoding.mock.calls.length === callsAfterLoad + 1,
      "debounced memo suggest",
    );
    expect(mockSuggestCoding.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ memo: "abcde" }),
    );
  });

  describe("intake prediction file labels", () => {
    const prediction = {
      status: "ok",
      intake_source: "list_drop",
      vendor: { public_id: "v-1", name: "V" },
      bill_number: "B-100",
      bill_date: "2026-01-15",
      total_amount: "100.00",
      description: "existing",
      sub_cost_code: null,
      project: null,
      header_confidence: null,
      coding_confidence: null,
    };

    function setupWithPrediction(lineItems: BillLineItem[]) {
      setupMocks(lineItems);
      mockGetOne.mockImplementation((path: string) => {
        if (path === BILL_GET_PATH) return Promise.resolve(sampleBill());
        if (path === "/api/v1/bill/bill-1/intake-prediction") return Promise.resolve(prediction);
        if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
          return Promise.reject(new ApiError(404, "Not found"));
        }
        return Promise.reject(new Error(`unexpected getOne: ${path}`));
      });
    }

    function formGroupForField(name: string): Element | null {
      const el = container.querySelector(`[name="${name}"]`);
      return el?.closest(".form-group") ?? null;
    }

    function headerFieldShowsFromFile(name: string): boolean {
      return formGroupForField(name)?.textContent?.includes("From file") ?? false;
    }

    function line1CellShowsFromFile(cellIndex: number): boolean {
      const row = lineItemRows()[0];
      if (!row) return false;
      return row.querySelectorAll("td")[cellIndex]?.textContent?.includes("From file") ?? false;
    }

    function matchingLineItem() {
      return sampleLineItem({
        description: "existing",
        rate: "100.00",
        quantity: 1,
        amount: "100.00",
      });
    }

    async function mountMatchingDraft() {
      setupWithPrediction([matchingLineItem()]);
      await mountBillEdit();
      await waitForReady();
      await flushUntilHard(
        () => headerFieldShowsFromFile("bill_number"),
        "bill number From file label",
      );
    }

    it("404 prediction → waits for fetch, then no From file labels", async () => {
      setupMocks([sampleLineItem()]);
      await mountBillEdit();
      await flushUntilHard(
        () => mockGetOne.mock.calls.some((c) => String(c[0]).includes("intake-prediction")),
        "intake-prediction fetch",
      );
      await flushUntilHard(
        () => container.querySelector('input[name="bill_number"]') !== null,
        "bill form ready",
      );
      expect(headerFieldShowsFromFile("bill_number")).toBe(false);
      expect(headerFieldShowsFromFile("vendor_public_id")).toBe(false);
    });

    it("vendor From file label shown while matching and hidden after vendor edit", async () => {
      await mountMatchingDraft();
      expect(headerFieldShowsFromFile("vendor_public_id")).toBe(true);
      await act(async () => {
        pickComboboxOptionByValue(
          container.querySelector('[data-bo-field="vendor_public_id"]')!,
          "v-2",
        );
      });
      await flushUntilHard(
        () => !headerFieldShowsFromFile("vendor_public_id"),
        "vendor label cleared after edit",
      );
    });

    it("bill number From file label shown while matching and hidden after edit", async () => {
      await mountMatchingDraft();
      expect(headerFieldShowsFromFile("bill_number")).toBe(true);
      const billNumber = container.querySelector('input[name="bill_number"]') as HTMLInputElement;
      await act(async () => {
        setInputValue(billNumber, "B-999");
      });
      await flushUntilHard(
        () => !headerFieldShowsFromFile("bill_number"),
        "bill number label cleared after edit",
      );
    });

    it("bill date From file label shown while matching and hidden after edit", async () => {
      await mountMatchingDraft();
      expect(headerFieldShowsFromFile("bill_date")).toBe(true);
      const billDate = container.querySelector('input[name="bill_date"]') as HTMLInputElement;
      await act(async () => {
        setInputValue(billDate, "2026-02-01");
      });
      await flushUntilHard(
        () => !headerFieldShowsFromFile("bill_date"),
        "bill date label cleared after edit",
      );
    });

    it("line-1 description From file label shown while matching and hidden after edit", async () => {
      await mountMatchingDraft();
      expect(line1CellShowsFromFile(0)).toBe(true);
      const row = lineItemRows()[0];
      await act(async () => {
        setInputValue(descriptionInput(row), "changed desc");
      });
      await flushUntilHard(
        () => !line1CellShowsFromFile(0),
        "line-1 description label cleared after edit",
      );
    });

    it("line-1 amount From file label shown while matching and hidden after edit", async () => {
      await mountMatchingDraft();
      expect(line1CellShowsFromFile(5)).toBe(true);
      const row = lineItemRows()[0];
      await act(async () => {
        setInputValue(rateInput(row), "50");
      });
      await flushUntilHard(() => !line1CellShowsFromFile(5), "line-1 amount label cleared after edit");
    });

    it("line-1 rate From file label with quantity 1 shown while matching and hidden after rate edit", async () => {
      await mountMatchingDraft();
      expect(line1CellShowsFromFile(4)).toBe(true);
      const row = lineItemRows()[0];
      await act(async () => {
        setInputValue(rateInput(row), "99");
      });
      await flushUntilHard(() => !line1CellShowsFromFile(4), "line-1 rate label cleared after edit");
    });

    it("does not show From file labels on non-draft bill", async () => {
      setupWithPrediction([sampleLineItem({ is_draft: false })]);
      mockGetOne.mockImplementation((path: string) => {
        if (path === BILL_GET_PATH) {
          return Promise.resolve(sampleBill({ is_draft: false, status: "completed" }));
        }
        if (path === "/api/v1/bill/bill-1/intake-prediction") return Promise.resolve(prediction);
        if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
          return Promise.reject(new ApiError(404, "Not found"));
        }
        return Promise.reject(new Error(`unexpected getOne: ${path}`));
      });
      await mountBillEdit();
      await flushUntilHard(
        () => mockGetOne.mock.calls.some((c) => String(c[0]).includes("intake-prediction")),
        "intake-prediction fetch",
      );
      await flushUntilHard(
        () => container.querySelector('input[name="bill_number"]') !== null,
        "bill form ready",
      );
      expect(headerFieldShowsFromFile("bill_number")).toBe(false);
      expect(headerFieldShowsFromFile("vendor_public_id")).toBe(false);
      expect(line1CellShowsFromFile(0)).toBe(false);
    });
  });

  describe("U-681 shared bill line layout", () => {
    it("measured table pins width contract and compact chip class", async () => {
      setupMocks([sampleLineItem()]);
      await mountBillEdit();
      await flushUntilHard(
        () => container.querySelector(".line-items-measured") !== null,
        "measured table",
      );
      const table = container.querySelector(".line-items-measured")!;
      expect(
        table.querySelector("col.bill-line-col-attachment")?.getAttribute("data-width-contract"),
      ).toBe("7.5rem");
      for (const col of table.querySelectorAll("colgroup col")) {
        expect(col.getAttribute("style")).toBeNull();
      }
      const cells = table.querySelectorAll("tbody tr td.line-item-cell");
      expect(cells.length).toBeGreaterThan(0);
    });

    it("header field order is Vendor before Bill Number; no Due Date", async () => {
      setupMocks([sampleLineItem()]);
      await mountBillEdit();
      await flushUntil(() => container.querySelector("#vendor_public_id") !== null);
      const labels = Array.from(container.querySelectorAll(".detail-fields-form label")).map(
        (l) => l.textContent?.replace("*", "").trim(),
      );
      expect(labels.indexOf("Vendor")).toBeLessThan(labels.indexOf("Bill Number"));
      expect(labels).not.toContain("Due Date");
    });

    it("footer shows sum of line amounts, not a single row", async () => {
      setupMocks([
        sampleLineItem({ public_id: "li-a", amount: "40.00", description: "a" }),
        sampleLineItem({ public_id: "li-b", amount: "35.50", description: "b" }),
      ]);
      await mountBillEdit();
      await flushUntil(() => lineItemRows().length === 2);
      const footer = container.querySelector(".inline-line-items > div:last-child");
      expect(footer?.textContent?.replace(/\s+/g, " ").trim()).toBe("Total Amount: $75.50");
      expect(footer?.textContent).not.toContain("$40.00");
    });

    it("hides remove when one line remains", async () => {
      setupMocks([sampleLineItem()]);
      await mountBillEdit();
      await flushUntil(() => lineItemRows().length === 1);
      expect(container.querySelector('button[aria-label="Remove line 1"]')).toBeNull();
    });

    it("PUT sends due_date equal to bill_date when the stored due date differs", async () => {
      // sampleBill stores bill_date 2026-01-15 / due_date 2026-02-15; DueDate = BillDate on every save.
      setupMocks([sampleLineItem()]);
      await mountBillEdit();
      await flushUntilHard(() => findSaveButton() !== null, "save ready");
      await act(async () => {
        setInputValue(
          container.querySelector('input[name="bill_number"]') as HTMLInputElement,
          "B-101",
        );
      });
      await act(async () => {
        findSaveButton().click();
      });
      await flushUntil(() =>
        mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"),
      );
      const billPuts = mockPut.mock.calls.filter((c) => c[0] === "/api/v1/update/bill/bill-1");
      expect(billPuts.length).toBeGreaterThan(0);
      for (const call of billPuts) {
        expect(call[1].bill_date).toBe("2026-01-15");
        expect(call[1].due_date).toBe("2026-01-15");
      }
    });

    it("PUT sends due_date equal to bill_date after bill date change", async () => {
      setupMocks([sampleLineItem()]);
      await mountBillEdit();
      await flushUntilHard(() => findSaveButton() !== null, "save ready");
      await act(async () => {
        setInputValue(
          container.querySelector('input[name="bill_date"]') as HTMLInputElement,
          "2026-03-01",
        );
      });
      await act(async () => {
        findSaveButton().click();
      });
      await flushUntil(() =>
        mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"),
      );
      const billPut = mockPut.mock.calls.find((c) => c[0] === "/api/v1/update/bill/bill-1");
      expect(billPut?.[1].bill_date).toBe("2026-03-01");
      expect(billPut?.[1].due_date).toBe("2026-03-01");
    });

    it("line edit bumps lineUserEditEpoch; remove does not", async () => {
      setupMocks([
        sampleLineItem({ public_id: "li-1", description: "one" }),
        sampleLineItem({ public_id: "li-2", description: "two" }),
      ]);
      await mountBillEdit();
      await flushUntilHard(() => lineItemRows().length === 2, "two lines");
      const epochBeforeEdit =
        codingSuggestHookCalls[codingSuggestHookCalls.length - 1]?.lineUserEditEpoch ?? 0;
      await act(async () => {
        setInputValue(
          lineItemRows()[0].querySelector('input[class*="inline-li-input"]') as HTMLInputElement,
          "edited",
        );
      });
      await flushUntilHard(
        () =>
          (codingSuggestHookCalls[codingSuggestHookCalls.length - 1]?.lineUserEditEpoch ?? 0) >
          epochBeforeEdit,
        "epoch bumped after edit",
      );
      const epochAfterEdit =
        codingSuggestHookCalls[codingSuggestHookCalls.length - 1]?.lineUserEditEpoch ?? 0;
      await act(async () => {
        (
          container.querySelector('button[aria-label="Remove line 2"]') as HTMLButtonElement
        ).click();
      });
      await flushUntil(() => lineItemRows().length === 1);
      expect(
        codingSuggestHookCalls[codingSuggestHookCalls.length - 1]?.lineUserEditEpoch ?? 0,
      ).toBe(epochAfterEdit);
    });

    it.each([
      ["reload succeeds", false],
      ["reload fails", true],
    ])("hides suggestion badges once Complete flips the bill to not-draft (%s)", async (_label, reloadFails) => {
      // After Complete the lines reload. On success the rows come back without suggestion
      // fields (behaviour check only); on failure the old rows keep their live suggestions
      // under a not-draft form, and only the draft gate hides the chips (gate pin).
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
      setupMocks([
        sampleLineItem({
          public_id: "li-sug",
          sub_cost_code_id: null,
          project_id: VISIBLE_PROJECT.id,
        }),
      ]);
      let completed = false;
      let lineSaved = false;
      const baseGetList = mockGetList.getMockImplementation()!;
      mockGetList.mockImplementation((path: string) => {
        if (path === BILL_LINE_ITEMS_PATH && completed && reloadFails) {
          return Promise.reject(new Error("line reload failed"));
        }
        if (path === BILL_LINE_ITEMS_PATH && lineSaved) {
          // What the server returns after the accepted line PUT: the coding is stored.
          return Promise.resolve(
            lineItemsListResponse([
              sampleLineItem({
                public_id: "li-sug",
                sub_cost_code_id: 10,
                project_id: VISIBLE_PROJECT.id,
                coding_prefill_state: "accepted",
              }),
            ]),
          );
        }
        return baseGetList(path);
      });
      const basePut = mockPut.getMockImplementation()!;
      mockPut.mockImplementation((path: string, body: unknown) => {
        if (path === "/api/v1/update/bill_line_item/li-sug") lineSaved = true;
        return basePut(path, body);
      });
      mockGetOne.mockImplementation((path: string) => {
        if (path === BILL_GET_PATH) {
          return Promise.resolve(
            completed ? sampleBill({ is_draft: false, status: "completed" }) : sampleBill(),
          );
        }
        if (path === "/api/v1/bill/bill-1/intake-prediction") {
          return Promise.reject(new ApiError(404, "Not found"));
        }
        if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
          return Promise.reject(new ApiError(404, "Not found"));
        }
        return Promise.reject(new Error(`unexpected getOne: ${path}`));
      });
      mockPost.mockImplementation((path: string) => {
        if (path === "/api/v1/complete/bill/bill-1") {
          completed = true;
          return Promise.resolve({});
        }
        return Promise.reject(new Error(`unexpected post: ${path}`));
      });

      await mountBillEdit();
      await flushUntilHard(() => lineItemRows().length === 1, "line table");
      await flushUntilHard(
        () => container.querySelector(".line-item-badge-slot .bill-line-chip") !== null,
        "draft shows the live suggestion chip",
      );

      const completeBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => b.textContent === "Complete Bill",
      )!;
      await act(async () => {
        completeBtn.click();
      });
      await flushUntilHard(() => completed, "POST /complete/bill");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500); // one completion-poll tick
      });
      await flushUntilHard(
        () => container.querySelector(".status-badge.finalized") !== null,
        "form flipped to not-draft",
      );
      expect(lineItemRows()).toHaveLength(1);
      expect(sccValue(lineItemRows()[0])).toBe("10");
      expect(container.querySelector(".line-item-badge-slot .bill-line-chip")).toBeNull();
    });

    it("project select updates projectHintForSuggest", async () => {
      setupMocks([sampleLineItem({ project_id: null, sub_cost_code_id: null })]);
      await mountBillEdit();
      await flushUntilHard(() => lineItemRows().length === 1, "line ready");
      await act(async () => {
        await setProjectValue(lineItemRows()[0], "p-visible");
      });
      await flushUntilHard(
        () =>
          codingSuggestHookCalls[codingSuggestHookCalls.length - 1]?.projectHintForSuggest ===
          "p-visible",
        "project hint updated",
      );
    });

    it("remove line does not trigger another suggestCoding round", async () => {
      mockSuggestCoding.mockResolvedValue(codingSuggestionPayloadEdit());
      setupMocks([
        sampleLineItem({ public_id: "li-1", sub_cost_code_id: null, project_id: null }),
        sampleLineItem({
          public_id: "li-2",
          sub_cost_code_id: null,
          project_id: null,
          description: "second",
        }),
      ]);
      await mountBillEdit();
      await flushUntilHard(() => lineItemRows().length === 2, "two lines");
      await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 1, "initial suggest");
      const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
      await act(async () => {
        setTextareaValue(memo, "memo change");
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      await flushUntilHard(() => mockSuggestCoding.mock.calls.length >= 2, "debounced suggest");
      const callsBeforeRemove = mockSuggestCoding.mock.calls.length;
      await act(async () => {
        (
          container.querySelector('button[aria-label="Remove line 2"]') as HTMLButtonElement
        ).click();
      });
      await flushUntil(() => lineItemRows().length === 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(mockSuggestCoding.mock.calls.length).toBe(callsBeforeRemove);
    });
  });

  describe("draft discard and null header", () => {
    it("renders draft without bill number; Bill Number not required", async () => {
      mockGetOne.mockImplementation((path: string) => {
        if (path === BILL_GET_PATH) {
          return Promise.resolve(
            sampleBill({ bill_number: null, vendor_id: null, status: "draft" }),
          );
        }
        if (path === "/api/v1/bill/bill-1/intake-prediction") {
          return Promise.reject(new ApiError(404, "Not found"));
        }
        if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
          return Promise.reject(new ApiError(404, "Not found"));
        }
        return Promise.reject(new Error(`unexpected getOne: ${path}`));
      });
      setupMocks([sampleLineItem()]);
      await mountBillEdit();
      await flushUntil(
        () => container.querySelector("h1")?.textContent?.includes("Draft bill") === true,
      );
      const billNumber = container.querySelector('input[name="bill_number"]') as HTMLInputElement;
      expect(billNumber.required).toBe(false);
    });

    it("Discard draft confirms delete and navigates to list", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      setupMocks([sampleLineItem()]);
      await mountBillEdit();
      await flushUntil(() =>
        Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.includes("Discard draft")),
      );
      const discardBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Discard draft"),
      )!;
      await act(async () => {
        discardBtn.click();
      });
      await flushUntil(() => mockNavigate.mock.calls.some((c) => c[0] === "/bill/list"));
      expect(mockDel).toHaveBeenCalledWith("/api/v1/delete/bill/bill-1");
      expect(mockToast).toHaveBeenCalledWith("Draft discarded.");
      confirmSpy.mockRestore();
    });

    it("Discard draft removes bill-intake-prediction query cache", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      setupMocks([sampleLineItem()]);
      queryClient.setQueryData(["bill-intake-prediction", "bill-1"], { status: "ok" });
      await mountBillEdit();
      await flushUntil(() =>
        Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.includes("Discard draft")),
      );
      const discardBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Discard draft"),
      )!;
      await act(async () => {
        discardBtn.click();
      });
      await flushUntil(() => mockNavigate.mock.calls.some((c) => c[0] === "/bill/list"));
      expect(queryClient.getQueryData(["bill-intake-prediction", "bill-1"])).toBeUndefined();
      confirmSpy.mockRestore();
    });

    it("non-draft keeps bottom Delete, not header Discard", async () => {
      setupMocks([sampleLineItem({ is_draft: false })]);
      mockGetOne.mockImplementation((path: string) => {
        if (path === BILL_GET_PATH) {
          return Promise.resolve(sampleBill({ is_draft: false, status: "completed" }));
        }
        if (path === "/api/v1/bill/bill-1/intake-prediction") {
          return Promise.reject(new ApiError(404, "Not found"));
        }
        if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
          return Promise.reject(new ApiError(404, "Not found"));
        }
        return Promise.reject(new Error(`unexpected getOne: ${path}`));
      });
      await mountBillEdit();
      await flushUntil(() => container.querySelector('input[name="bill_number"]') !== null);
      expect(
        Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.includes("Discard draft")),
      ).toBe(false);
      expect(
        Array.from(container.querySelectorAll("button")).some((b) => b.textContent?.trim() === "Delete"),
      ).toBe(true);
    });
  });

});

describe("U-700 BillEdit navigation and reference data", () => {
  const REF_PATHS = [
    "/api/v1/get/vendors",
    "/api/v1/get/payment-terms",
    "/api/v1/get/sub-cost-codes",
    "/api/v1/get/projects",
  ] as const;

  function countGetList(path: string) {
    return mockGetList.mock.calls.filter((c) => c[0] === path).length;
  }

  beforeEach(() => {
    mockNavigate.mockClear();
    lookupHookCalls.n = 0;
  });

  it("loads each reference dataset once (no /lookups duplicate)", async () => {
    setupMocks([sampleLineItem()]);
    await mountBillEdit();
    await waitForReady();
    for (const path of REF_PATHS) {
      expect(countGetList(path), path).toBe(1);
    }
    expect(lookupHookCalls.n).toBe(0);
    expect(
      mockGetList.mock.calls.some((c) => String(c[0]).includes("/lookups")),
    ).toBe(false);
  });

  it("Cancel navigates to /bill/list", async () => {
    setupMocks([sampleLineItem({ project_id: VISIBLE_PROJECT.id })]);
    await mountBillEdit();
    await waitForReady();
    const cancelBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Cancel",
    )!;
    await act(async () => {
      cancelBtn.click();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/bill/list");
  });

  it("failed Save does not navigate away", async () => {
    setupMocks([sampleLineItem({ project_id: VISIBLE_PROJECT.id })]);
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1") {
        return Promise.reject(new Error("save failed"));
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });
    await mountBillEdit();
    await waitForReady();
    await act(async () => {
      findSaveButton().click();
    });
    await flushUntil(() => container.textContent?.includes("save failed") ?? false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("handleSubmitForReview success navigates to /bill/list without detouring to bill view", async () => {
    setupMocks([sampleLineItem({ project_id: VISIBLE_PROJECT.id })]);
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/submit/review/bill/bill-1") {
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });
    await mountBillEdit();
    await waitForReady();
    const submitBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Submit for Review" && !b.dataset.testid,
    )!;
    await flushUntil(() => !submitBtn.disabled);
    await act(async () => {
      submitBtn.click();
    });
    await flushUntil(() =>
      mockPost.mock.calls.some((c) => c[0] === "/api/v1/submit/review/bill/bill-1"),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/bill/list");
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/bill-1");
  });

  it("implicit form submit (Enter) does not navigate to bill view before list (U-708)", async () => {
    setupMocks([sampleLineItem({ project_id: VISIBLE_PROJECT.id })]);
    await mountBillEdit();
    await waitForReady();
    const form = container.querySelector("form.detail-card") as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/bill/bill-1"));
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/bill-1");
    expect(mockNavigate).toHaveBeenCalledWith("/bill/list");
  });

  it("handleSubmitForReview failure does not navigate away", async () => {
    setupMocks([sampleLineItem({ project_id: VISIBLE_PROJECT.id })]);
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/submit/review/bill/bill-1") {
        return Promise.reject(new Error("submit failed"));
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });
    await mountBillEdit();
    await waitForReady();
    const submitBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Submit for Review" && !b.dataset.testid,
    )!;
    await flushUntil(() => !submitBtn.disabled);
    await act(async () => {
      submitBtn.click();
    });
    await flushUntil(() => container.textContent?.includes("submit failed") ?? false);
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/list");
  });

  it("ReviewTimeline onAfterSubmit navigates to /bill/list", async () => {
    vi.mocked(ReviewTimeline).mockImplementation((props) =>
      createElement(
        "button",
        {
          type: "button",
          "data-testid": "review-submit-stub",
          onClick: async () => {
            if (props.onBeforeAction) {
              const ok = await props.onBeforeAction("submit", true);
              if (!ok) return;
            }
            await mockPost(REVIEW_SUBMIT_PATH, { comments: null });
            props.onAfterSubmit?.();
          },
        },
        "Submit",
      ),
    );
    setupMocks([sampleLineItem({ project_id: VISIBLE_PROJECT.id })]);
    mockPost.mockImplementation((path: string) => {
      if (path === REVIEW_SUBMIT_PATH) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });
    await mountBillEdit();
    await waitForReady();
    const stub = container.querySelector('[data-testid="review-submit-stub"]') as HTMLButtonElement;
    expect(stub).toBeTruthy();
    await act(async () => {
      stub.click();
    });
    await flushUntil(() => mockNavigate.mock.calls.some((c) => c[0] === "/bill/list"));
    expect(mockNavigate).toHaveBeenCalledWith("/bill/list");
  });

  it("Complete navigates to /bill/list only after poll reports completion", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setupMocks([sampleLineItem({ project_id: VISIBLE_PROJECT.id })]);
    let completed = false;
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/complete/bill/bill-1") {
        completed = true;
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });
    mockGetOne.mockImplementation((path: string) => {
      if (path === BILL_GET_PATH) {
        return Promise.resolve(
          completed ? sampleBill({ is_draft: false }) : sampleBill(),
        );
      }
      if (path === "/api/v1/bill/bill-1/intake-prediction") {
        return Promise.reject(new ApiError(404, "Not found"));
      }
      if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
        return Promise.reject(new ApiError(404, "Not found"));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });
    await mountBillEdit();
    await waitForReady();
    const completeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Complete Bill",
    )!;
    await act(async () => {
      completeBtn.click();
    });
    await flushUntil(() => completed);
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/list");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    await flushUntilHard(
      () => mockNavigate.mock.calls.some((c) => c[0] === "/bill/list"),
      "Complete navigates to /bill/list after the poll reports completion",
    );
    expect(mockToast).toHaveBeenCalledWith(
      "Bill completed — external syncs continue in the background.",
    );
  });

  it("Complete poll error does not navigate to /bill/list", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setupMocks([sampleLineItem({ project_id: VISIBLE_PROJECT.id })]);
    let pollStarted = false;
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/complete/bill/bill-1") {
        pollStarted = true;
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });
    const baseGetOne = mockGetOne.getMockImplementation()!;
    mockGetOne.mockImplementation((path: string) => {
      if (path === BILL_GET_PATH && pollStarted) {
        return Promise.reject(new ApiError(500, "poll failed"));
      }
      return baseGetOne(path);
    });
    await mountBillEdit();
    await waitForReady();
    const completeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Complete Bill",
    )!;
    await act(async () => {
      completeBtn.click();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    await flushUntil(
      () => container.querySelector(".completion-status-bar--error") !== null,
    );
    expect(container.textContent).toContain("Completion failed: poll failed");
    expect(mockNavigate).not.toHaveBeenCalledWith("/bill/list");
  });
});

describe("U-708 saveAll line sync and cache merge", () => {
  const LINE_PUT_PATH = "/api/v1/update/bill_line_item/li-1";
  const ATT_ID = 501;

  function lineItemsFetchCount(): number {
    return mockGetList.mock.calls.filter((c) => c[0] === BILL_LINE_ITEMS_PATH).length;
  }

  async function waitForPdf() {
    await flushUntil(() => container.querySelector('iframe[title="Bill PDF"]') !== null);
  }

  function wireAttachmentGetOne() {
    const baseGetOne = mockGetOne.getMockImplementation()!;
    mockGetOne.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
        return Promise.resolve({ public_id: "blia-1", attachment_id: ATT_ID });
      }
      if (path === `/api/v1/get/attachment/id/${ATT_ID}`) {
        return Promise.resolve({ public_id: "att-pub-1" });
      }
      return baseGetOne(path);
    });
  }

  beforeEach(() => {
    mockUseViewAttachmentObjectUrl.mockReturnValue({
      objectUrl: "blob:test-pdf",
      loading: false,
      loadError: null,
    });
    setupMocks([
      sampleLineItem({ project_id: VISIBLE_PROJECT.id, description: "line" }),
    ]);
    wireAttachmentGetOne();
  });

  it("does not re-fetch line items or drop the PDF iframe after Save", async () => {
    await mountBillEdit();
    await waitForPdf();
    expect(lineItemsFetchCount()).toBe(1);

    await clickSave();

    queryClient.setQueryData(entityItemKey(BILL_GET_PATH), sampleBill({ row_version: "brv-2" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(lineItemsFetchCount()).toBe(1);
    expect(container.querySelector('iframe[title="Bill PDF"]')).toBeTruthy();
  });

  it("stamps coding_prefill_state from line PUT so a later draft save does not downgrade", async () => {
    setupMocks([
      sampleLineItem({
        project_id: VISIBLE_PROJECT.id,
        description: "line",
        coding_prefill_state: "prefilled",
      }),
    ]);
    wireAttachmentGetOne();

    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1") {
        return Promise.resolve(sampleBill({ row_version: "brv-2" }));
      }
      if (path === LINE_PUT_PATH) {
        return Promise.resolve({
          public_id: "li-1",
          row_version: "rv-1b",
          coding_prefill_state: "accepted",
        });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    mockPost.mockImplementation((path: string) => {
      if (path === REVIEW_SUBMIT_PATH) {
        return Promise.reject(new ApiError(500, "submit failed"));
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });

    await mountBillEdit();
    await waitForPdf();

    const submitBtn = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (b) => b.textContent === "Submit for Review" && !b.dataset.testid,
    )!;
    await act(async () => {
      submitBtn.click();
    });
    await flushUntil(() =>
      mockPut.mock.calls.filter((c) => c[0] === LINE_PUT_PATH).length >= 1,
    );

    await clickSave();

    await flushUntil(() =>
      mockPut.mock.calls.filter((c) => c[0] === LINE_PUT_PATH).length >= 2,
    );

    const linePuts = mockPut.mock.calls.filter((c) => c[0] === LINE_PUT_PATH);
    expect((linePuts[0]![1] as Record<string, unknown>).coding_prefill_state).toBe("accepted");
    expect((linePuts[1]![1] as Record<string, unknown>).coding_prefill_state).toBe("accepted");
  });

  it("does not stamp coding_prefill_state from a stale line PUT when the user changed SCC during the await", async () => {
    setupMocks([
      sampleLineItem({
        project_id: VISIBLE_PROJECT.id,
        description: "line",
        sub_cost_code_id: 10,
        coding_prefill_state: "prefilled",
      }),
    ]);
    wireAttachmentGetOne();

    const pendingLinePuts: Array<{
      resolve: (row: BillLineItem) => void;
      promise: Promise<BillLineItem>;
    }> = [];
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill/bill-1") {
        return Promise.resolve(sampleBill({ row_version: "brv-2" }));
      }
      if (path === LINE_PUT_PATH) {
        let resolve!: (row: BillLineItem) => void;
        const promise = new Promise<BillLineItem>((res) => {
          resolve = res;
        });
        pendingLinePuts.push({ resolve, promise });
        return promise;
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    await mountBillEdit();
    await waitForPdf();
    await flushUntil(() => lineItemRows().length === 1);
    await flushUntil(() => sccValue(lineItemRows()[0]) === "10");

    await act(async () => {
      findSaveButton().click();
    });
    await flushUntil(() => pendingLinePuts.length === 1);

    await act(async () => {
      await setSccValue(lineItemRows()[0], "1");
    });
    await flushUntil(() => sccValue(lineItemRows()[0]) === "1");

    pendingLinePuts[0]!.resolve({
      public_id: "li-1",
      row_version: "rv-1b",
      coding_prefill_state: "accepted",
    } as BillLineItem);
    await act(async () => {
      await pendingLinePuts[0]!.promise;
    });
    await flushUntil(() => findSaveButton().textContent?.trim() === "Save");

    mockPut.mockClear();
    await clickSave();

    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === LINE_PUT_PATH));
    const linePut = mockPut.mock.calls.find((c) => c[0] === LINE_PUT_PATH);
    expect((linePut![1] as Record<string, unknown>).coding_prefill_state).toBe("changed");
  });
});
