import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BillEdit from "./BillEdit";
import { ApiError } from "../../api/client";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue } from "../../__testutils__/domEvents";
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
  useLookups: () => ({
    data: {
      vendors: [{ public_id: "v-1", id: 1, name: "V" }],
      payment_terms: [{ public_id: "pt-1", id: 1, name: "Net 30" }],
      sub_cost_codes: [{ id: 1, public_id: "scc-1", name: "SCC", number: "01" }],
      projects: [{ public_id: "p-1", id: 1, name: "P" }],
    },
    loading: false,
  }),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

vi.mock("../../components/ReviewTimeline", () => ({
  default: () => null,
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
    if (path.startsWith("/api/v1/get/bill-line-item-attachment/by-bill-line-item/")) {
      return Promise.reject(new ApiError(404, "Not found"));
    }
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  mockGetList.mockImplementation((path: string) => {
    if (path === "/api/v1/get/vendors") {
      return Promise.resolve({ data: [{ id: 1, public_id: "v-1", name: "V" }], count: 1 });
    }
    if (path === "/api/v1/get/payment-terms") {
      return Promise.resolve({ data: [{ id: 1, public_id: "pt-1" }], count: 1 });
    }
    if (path === "/api/v1/get/sub-cost-codes") {
      return Promise.resolve({
        data: [{ id: 1, public_id: "scc-1", name: "SCC", number: "01" }],
        count: 1,
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

function findSaveButton(): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Save",
  );
  expect(btn).toBeDefined();
  return btn!;
}

function findAddRowButton(): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "+ Add Row",
  );
  expect(btn).toBeDefined();
  return btn!;
}

function lineItemRows(): HTMLTableRowElement[] {
  return Array.from(container.querySelectorAll("tbody tr")).filter(
    (tr) => !tr.querySelector(".empty-state"),
  ) as HTMLTableRowElement[];
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


  function projectSelect(row: HTMLTableRowElement): HTMLSelectElement {
    return row.querySelectorAll("td")[2].querySelector("select") as HTMLSelectElement;
  }

  function setSelectValue(select: HTMLSelectElement, value: string): void {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )!.set!;
    nativeSetter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findSubmitForReviewButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Submit for Review"),
    );
  }

  function stickyProjectOption(): HTMLOptionElement | undefined {
    return Array.from(container.querySelectorAll("option")).find((o) =>
      o.textContent?.includes("Project #144"),
    );
  }

  async function waitForUnresolvedProjectLoaded() {
    await flushUntil(() => stickyProjectOption() != null);
    expect(stickyProjectOption()).toBeDefined();
  }

  beforeEach(() => {
    setupMocks([unresolvedProjectLine()]);
  });

  it("lookup-miss survives a save: PUT body omits project_public_id", async () => {
    renderBillEdit();
    await waitForUnresolvedProjectLoaded();

    mockPut.mockClear();

    await clickSave();

    const liPuts = putCallsForLineItem("li-hidden-proj");
    expect(liPuts).toHaveLength(1);
    const body = liPuts[0][1];
    expect(body).not.toHaveProperty("project_public_id");
  });

  it("user-cleared project saves null: PUT body has project_public_id === null", async () => {
    renderBillEdit();
    await waitForUnresolvedProjectLoaded();

    const select = projectSelect(lineItemRows()[0]);
    expect(select.value).toBe("__unresolved_project__");

    await act(async () => {
      setSelectValue(select, "");
    });

    await flushUntil(() => stickyProjectOption() == null);
    expect(stickyProjectOption()).toBeUndefined();
    expect(select.value).toBe("");

    mockPut.mockClear();

    await clickSave();

    const liPuts = putCallsForLineItem("li-hidden-proj");
    expect(liPuts).toHaveLength(1);
    expect(liPuts[0][1].project_public_id).toBeNull();
  });

  it("sticky option renders disabled and Submit for Review is enabled", async () => {
    renderBillEdit();
    await waitForUnresolvedProjectLoaded();

    const sticky = stickyProjectOption()!;
    expect(sticky.textContent).toContain("Project #144");
    expect(sticky.disabled).toBe(true);

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

    renderBillEdit();

    await flushUntil(() => {
      const rows = lineItemRows();
      if (rows.length === 0) return false;
      return projectSelect(rows[0]).value === "p-visible";
    });
    expect(lineItemRows()).toHaveLength(1);
    expect(projectSelect(lineItemRows()[0]).value).toBe("p-visible");
    expect(stickyProjectOption()).toBeUndefined();

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

    renderBillEdit();

    await flushUntil(() => lineItemRows().length === 1);
    expect(lineItemRows()).toHaveLength(1);
    expect(stickyProjectOption()).toBeUndefined();
    expect(projectSelect(lineItemRows()[0]).value).toBe("");

    mockPut.mockClear();

    await clickSave();

    const liPuts = putCallsForLineItem("li-no-proj");
    expect(liPuts).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(liPuts[0][1], "project_public_id")).toBe(true);
    expect(liPuts[0][1].project_public_id).toBeNull();
  });

  it("unresolved_project_id survives the savedItems write-back across two saves", async () => {
    renderBillEdit();
    await waitForUnresolvedProjectLoaded();

    mockPut.mockClear();

    await clickSave();
    await clickSave();

    const liPuts = putCallsForLineItem("li-hidden-proj");
    expect(liPuts).toHaveLength(2);
    expect(Object.prototype.hasOwnProperty.call(liPuts[0][1], "project_public_id")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(liPuts[1][1], "project_public_id")).toBe(false);

    expect(stickyProjectOption()).toBeDefined();
    expect(stickyProjectOption()!.disabled).toBe(true);
  });

  it("switching from an unresolved project to a visible one sends the new public_id", async () => {
    renderBillEdit();
    await waitForUnresolvedProjectLoaded();

    const select = projectSelect(lineItemRows()[0]);
    expect(select.value).toBe("__unresolved_project__");

    await act(async () => {
      setSelectValue(select, "p-visible");
    });

    await flushUntil(() => stickyProjectOption() == null);
    expect(stickyProjectOption()).toBeUndefined();
    expect(select.value).toBe("p-visible");

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

    renderBillEdit();
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

    renderBillEdit();
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

    renderBillEdit();
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
