import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ExpenseEdit from "./ExpenseEdit";
import { ApiError } from "../../api/client";
import type { Expense } from "../../types/api";
import { setInputValue, setTextareaValue } from "../../__testutils__/domEvents";
import {
  comboboxInput,
  getComboboxValue,
  pickComboboxOptionByValue,
  tabAwayFromCombobox,
  waitForCombobox,
} from "../../test/combobox";
import ReviewTimeline from "../../components/ReviewTimeline";
import { flushUntil, flushUntilHard } from "../../__testutils__/flush";
import { RefetchWitness, WITNESS_ID } from "../../__testutils__/formSeedGuardHarness";
import {
  inlineLineItemInput,
  inlineLineItemInputForValue,
  inlineLineItemRows,
} from "../../__testutils__/lineItemsDom";
import { entityItemKey } from "../../hooks/useEntity";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EXPENSE_GET_PATH = "/api/v1/get/expense/exp-1";
const EXPENSE_UPDATE_PATH = "/api/v1/update/expense/exp-1";
const EXPENSE_CODING_SUGGEST_PATH = "/api/v1/expense/exp-1/coding/suggest";
const LINE_CREATE_PATH = "/api/v1/create/expense_line_item";
const ELIA_BY_LINE_PREFIX = "/api/v1/get/expense-line-item-attachment/by-expense-line-item/";
const ELIA_CREATE_PATH = "/api/v1/create/expense-line-item-attachment";
const STALE_COMPLETION_RESULT_PATH = "/api/v1/get/expense/exp-1/completion-result";
const VENDOR_1_PUBLIC_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

let mockCurrentUserData: {
  is_admin: boolean;
  modules: import("../../types/api").CurrentUserModule[];
  auth: { public_id: string; username: string };
  user: { id: number; public_id: string; firstname: string; lastname: string };
  role: null;
  accessible_project_ids: number[];
};

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
  loadError: false,
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

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

vi.mock("../../components/ReviewTimeline", () => ({
  default: vi.fn(() => null),
}));

vi.mock("../../components/LineItemAttachment", () => ({
  default: () => null,
}));

vi.mock("../../hooks/useViewAttachmentObjectUrl", () => ({
  useViewAttachmentObjectUrl: () => mockUseViewAttachmentObjectUrl(),
}));

mockCurrentUserData = {
  is_admin: true,
  modules: [],
  auth: { public_id: "a", username: "admin" },
  user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
  role: null,
  accessible_project_ids: [],
};

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: mockCurrentUserData,
    isLoading: false,
  }),
}));

vi.mock("../../hooks/useLookups", () => ({
  useLookups: () => ({
    data: {
      vendors: [{ public_id: VENDOR_1_PUBLIC_ID, name: "Acme Supply" }],
    },
    loading: false,
  }),
}));

let expenseDeleteDocumentAutoSaveStub = false;
const mockCancelAutoSaveForDelete = vi.fn();

vi.mock("../../hooks/useAutoSave", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../hooks/useAutoSave")>();
  return {
    useAutoSave: (
      saveFn: Parameters<typeof mod.useAutoSave>[0],
      deps: Parameters<typeof mod.useAutoSave>[1],
      delay?: number,
      enabled?: boolean,
    ) => {
      if (expenseDeleteDocumentAutoSaveStub) {
        return {
          flush: vi.fn().mockResolvedValue(undefined),
          cancel: mockCancelAutoSaveForDelete,
        };
      }
      return mod.useAutoSave(saveFn, deps, delay, enabled);
    },
  };
});

function sampleExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1,
    public_id: "exp-1",
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    vendor_id: 1,
    expense_date: "2026-01-15",
    reference_number: "EXP-100",
    total_amount: "100.00",
    memo: "",
    is_draft: true,
    is_credit: false,
    ...overrides,
  };
}

/** Slim list-row shape returned by GET expense line items in these specs. */
function expenseLineItemFixture(
  publicId: string,
  description: string,
  amount: string,
  extras: { project_id?: number | null; sub_cost_code_id?: number | null } = {},
) {
  const suffix = publicId.replace(/^li-/, "");
  return {
    public_id: publicId,
    row_version: `rv-${suffix}`,
    description,
    sub_cost_code_id: extras.sub_cost_code_id ?? null,
    project_id: extras.project_id ?? null,
    quantity: null,
    rate: null,
    amount,
    is_billable: true,
    markup: null,
    price: null,
  };
}

const SUB_COST_CODES_PATH = "/api/v1/get/sub-cost-codes";
const PROJECTS_PATH = "/api/v1/get/projects";
const VENDORS_PATH = "/api/v1/get/vendors";
const PROJECT_144_PUBLIC_ID = "11111111-2222-3333-4444-555555555555";
const EXPENSE_SUGGEST_BUDGET_PROJECT = {
  project_id: 144,
} as const;
const REVIEW_SUBMIT_PATH = "/api/v1/submit/review/expense/exp-1";
const EXPENSE_DELETE_PATH = "/api/v1/delete/expense/exp-1";

type ListEnvelope = { data: unknown[]; count: number };

/** Vendor catalog for useEntityList — injected so the header form can seed vendor_public_id (U-487). */
function codingCatalogGetList(path: string): ListEnvelope | null {
  if (path === VENDORS_PATH) {
    return {
      data: [{ id: 1, public_id: VENDOR_1_PUBLIC_ID, name: "Acme Supply" }],
      count: 1,
    };
  }
  return null;
}

function mockGetListWithCodingCatalog(
  handler: (path: string) => Promise<ListEnvelope> | ListEnvelope,
) {
  mockGetList.mockImplementation((path: string) => {
    const catalog = codingCatalogGetList(path);
    if (catalog) return Promise.resolve(catalog);
    return Promise.resolve(handler(path));
  });
}

function mockGetListResolvedForAll(body: ListEnvelope) {
  mockGetListWithCodingCatalog(() => body);
}

function allMockedClientPaths(): string[] {
  return [
    ...mockGetOne.mock.calls.map((c) => String(c[0])),
    ...mockGetList.mock.calls.map((c) => String(c[0])),
    ...mockPost.mock.calls.map((c) => String(c[0])),
    ...mockPut.mock.calls.map((c) => String(c[0])),
    ...mockDel.mock.calls.map((c) => String(c[0])),
  ];
}

function assertNeverPolledCompletionResult() {
  for (const path of allMockedClientPaths()) {
    expect(path).not.toContain("completion-result");
  }
}

function expenseGetCallCount(): number {
  return mockGetOne.mock.calls.filter((c) => c[0] === EXPENSE_GET_PATH).length;
}

function completionSuccessToastCalled(): boolean {
  return mockToast.mock.calls.some((c) => String(c[0]).includes("Expense completed"));
}

function renderExpenseEdit(root: Root) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/expense/exp-1/edit"] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/expense/:publicId/edit",
              element: createElement(ExpenseEdit),
            }),
          ),
        ),
      ),
    );
  });
}

async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 40; i++) {
      await Promise.resolve();
    }
  });
}

async function waitForCondition(check: () => boolean) {
  await act(async () => {
    for (let i = 0; i < 50; i++) {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      if (check()) return;
    }
  });
}

async function waitForReady(container: HTMLElement) {
  await waitForCondition(() => container.textContent?.includes("Complete Expense") ?? false);
  expect(container.textContent).toContain("Complete Expense");
}

function completeButton(container: HTMLElement): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Complete Expense") || btn.textContent?.includes("Completing..."),
    ) ?? null
  );
}

function elia404IfMatch(path: string): Promise<never> | undefined {
  if (path.startsWith(ELIA_BY_LINE_PREFIX)) {
    return Promise.reject(new ApiError(404, "Not found"));
  }
  return undefined;
}

function findSaveButton(container: HTMLElement): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Save",
  );
  expect(btn).toBeDefined();
  return btn as HTMLButtonElement;
}

function findAddRowButton(container: HTMLElement): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "+ Add Row",
  );
  expect(btn).toBeDefined();
  return btn as HTMLButtonElement;
}

async function clickSave(container: HTMLElement) {
  await act(async () => {
    findSaveButton(container).click();
  });
  await flushUntil(() => {
    const btn = Array.from(container.querySelectorAll("button")).find(
      (x) => x.textContent?.trim() === "Save" || x.textContent?.trim() === "Saving...",
    );
    return btn?.textContent?.trim() === "Save";
  });
  await act(async () => {
    for (let i = 0; i < 40; i++) {
      await Promise.resolve();
    }
  });
}

function expenseHeaderPutBodies(): Record<string, unknown>[] {
  return mockPut.mock.calls
    .filter((c) => c[0] === EXPENSE_UPDATE_PATH)
    .map((c) => c[1] as Record<string, unknown>);
}

function postCallsForDescription(desc: string): [string, Record<string, unknown>][] {
  return mockPost.mock.calls.filter(
    (c) =>
      c[0] === LINE_CREATE_PATH &&
      (c[1] as Record<string, unknown>).description === desc,
  ) as [string, Record<string, unknown>][];
}

function putCallsForLineItem(id: string): [string, Record<string, unknown>][] {
  return mockPut.mock.calls.filter(
    (c) => c[0] === `/api/v1/update/expense_line_item/${id}`,
  ) as [string, Record<string, unknown>][];
}

function lineDeletesFor(id: string) {
  return mockDel.mock.calls.filter((c) => c[0] === `/api/v1/delete/expense_line_item/${id}`);
}

describe("ExpenseEdit completion polling", () => {
  let container: HTMLDivElement;
  let root: Root;
  let pollPhase = false;
  let pollCallIndex = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    pollPhase = false;
    pollCallIndex = 0;

    mockGetListResolvedForAll({ data: [], count: 0 });
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/complete/expense/exp-1") {
        return Promise.resolve({});
      }
      return Promise.reject(new Error("unexpected post: " + path));
    });
    mockPut.mockImplementation((path: string, body: { is_draft?: boolean }) => {
      if (path === "/api/v1/update/expense/exp-1") {
        return Promise.resolve(
          sampleExpense({
            row_version: "rv-2",
            is_draft: body?.is_draft ?? true,
          }),
        );
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });
    mockDel.mockResolvedValue({});

    vi.stubGlobal("confirm", vi.fn(() => true));

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
    vi.unstubAllGlobals();
  });

  function setupGetOnePollResponses(pollIsDraft: boolean[]) {
    pollPhase = false;
    pollCallIndex = 0;
    mockGetOne.mockImplementation((path: string) => {
      // Legacy completion-result is a never-cleared per-process cache: on retry it
      // returns 200 immediately with a previous run's payload. Resolving that
      // stale 200 here is what lets this suite fail against the old implementation.
      if (path === STALE_COMPLETION_RESULT_PATH) {
        return Promise.resolve({ status_code: 200, message: "Completed" });
      }
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path !== EXPENSE_GET_PATH) {
        return Promise.reject(new Error(`unexpected getOne: ${path}`));
      }
      if (!pollPhase) {
        return Promise.resolve(sampleExpense({ is_draft: true }));
      }
      const isDraft = pollIsDraft[pollCallIndex++] ?? true;
      return Promise.resolve(sampleExpense({ is_draft: isDraft }));
    });
  }

  async function clickCompleteExpense() {
    const btn = completeButton(container);
    expect(btn).not.toBeNull();
    await act(async () => {
      btn!.click();
      await flushMicrotasks();
    });
    pollPhase = true;
  }

  async function advancePollInterval(times = 1) {
    for (let i = 0; i < times; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      await flushMicrotasks();
    }
  }

  it("polls the expense entity, never the stale completion-result endpoint", async () => {
    setupGetOnePollResponses([true]);
    renderExpenseEdit(root);
    await waitForReady(container);
    const baseline = expenseGetCallCount();
    await clickCompleteExpense();

    await advancePollInterval(1);

    assertNeverPolledCompletionResult();
    expect(expenseGetCallCount()).toBeGreaterThan(baseline);
  });

  it("does not settle while the expense is still a draft", async () => {
    setupGetOnePollResponses([true, true]);
    renderExpenseEdit(root);
    await waitForReady(container);
    await clickCompleteExpense();

    await advancePollInterval(1);
    // Target status-bar polling UI, not /Completing/ — the Complete button label
    // also contains "Completing..." and would mask a stale completion-result settle.
    expect(container.textContent).toContain("(poll #");
    expect(container.textContent).not.toContain("View Expense");
    expect(completionSuccessToastCalled()).toBe(false);

    await advancePollInterval(1);
    expect(container.textContent).toContain("(poll #");
    expect(container.textContent).not.toContain("View Expense");
    expect(completionSuccessToastCalled()).toBe(false);
  });

  it("settles only when is_draft flips false", async () => {
    setupGetOnePollResponses([true, true, false]);
    renderExpenseEdit(root);
    await waitForReady(container);
    await clickCompleteExpense();

    await advancePollInterval(3);

    expect(completionSuccessToastCalled()).toBe(true);
    expect(mockToast).toHaveBeenCalledWith(
      "Expense completed — external syncs continue in the background.",
    );
    expect(container.textContent).toContain(
      "Expense completed — external syncs continue in the background.",
    );
  });
});

describe("ExpenseEdit line-item delete tracking", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) {
        return Promise.resolve(sampleExpense({ is_draft: true }));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    mockGetListResolvedForAll({
      data: [
        {
          public_id: "li-a",
          row_version: "rv-li-a",
          description: "Line A",
          sub_cost_code_id: null,
          quantity: null,
          rate: null,
          amount: "10",
          is_billable: true,
          markup: null,
          price: null,
        },
        {
          public_id: "li-b",
          row_version: "rv-li-b",
          description: "Line B",
          sub_cost_code_id: null,
          quantity: null,
          rate: null,
          amount: "20",
          is_billable: true,
          markup: null,
          price: null,
        },
      ],
      count: 2,
    });

    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/expense/exp-1") {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true }));
      }
      if (path.startsWith("/api/v1/update/expense_line_item/")) {
        return Promise.resolve({
          public_id: path.split("/").pop(),
          row_version: "rv-li-upd",
        });
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    mockDel.mockResolvedValue({});

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

  // The remove control is anchored by its accessible label (title="Remove"),
  // not InlineLineItems' internal CSS class, so a styling-hook rename can't
  // break this suite.
  const removeButton = () => container.querySelector('button[title="Remove"]');

  async function waitForLineItems() {
    await waitForCondition(() => removeButton() !== null);
    expect(removeButton()).not.toBeNull();
  }

  function findSaveButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Save",
    ) as HTMLButtonElement | undefined;
  }

  it("issues DELETE for a line item removed after a prior successful save", async () => {
    renderExpenseEdit(root);
    await waitForLineItems();
    await flushMicrotasks();

    const firstSave = findSaveButton();
    expect(firstSave).toBeDefined();
    await act(async () => {
      firstSave!.click();
      await flushMicrotasks();
    });

    expect(mockDel).not.toHaveBeenCalled();

    await act(async () => {
      const removeBtn = removeButton();
      expect(removeBtn).not.toBeNull();
      removeBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushMicrotasks();
    });

    mockDel.mockClear();

    const secondSave = findSaveButton();
    expect(secondSave).toBeDefined();
    await act(async () => {
      secondSave!.click();
      await flushMicrotasks();
    });

    expect(mockDel).toHaveBeenCalledWith("/api/v1/delete/expense_line_item/li-a");
  });
});

describe("ExpenseEdit line-item row identity (stable uid keys)", () => {
  let container: HTMLDivElement;
  let root: Root;

  function renderWithQueryClient(): QueryClient {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/expense/exp-1/edit"] },
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(
              Fragment,
              null,
              createElement(RefetchWitness, { itemPath: EXPENSE_GET_PATH }),
              createElement(
                Routes,
                null,
                createElement(Route, {
                  path: "/expense/:publicId/edit",
                  element: createElement(ExpenseEdit),
                }),
              ),
            ),
          ),
        ),
      );
    });
    return queryClient;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) {
        return Promise.resolve(sampleExpense({ is_draft: true }));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    mockGetListResolvedForAll({
      data: [
        expenseLineItemFixture("li-1", "Line One", "10"),
        expenseLineItemFixture("li-2", "Line Two", "20"),
        expenseLineItemFixture("li-3", "Line Three", "30"),
        expenseLineItemFixture("li-4", "Line Four", "40"),
      ],
      count: 4,
    });

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

  function lineItemDataRows(): HTMLTableRowElement[] {
    return inlineLineItemRows(container);
  }

  function rowDescriptionInput(row: HTMLTableRowElement): HTMLInputElement {
    return inlineLineItemInput(row);
  }

  function rowDescriptionInputForValue(value: string): HTMLInputElement {
    return inlineLineItemInputForValue(container, value);
  }

  async function waitForFourLineItems() {
    await flushUntil(() => inlineLineItemRows(container).length === 4);
    expect(lineItemDataRows()).toHaveLength(4);
  }

  it("mid-list remove keeps each surviving line's description on its logical row", async () => {
    renderExpenseEdit(root);
    await waitForFourLineItems();
    await flushMicrotasks();

    let rows = lineItemDataRows();
    const inputLineTwo = rowDescriptionInput(rows[1]!);
    const inputLineThree = rowDescriptionInput(rows[2]!);
    const inputLineFour = rowDescriptionInput(rows[3]!);
    setInputValue(inputLineFour, "Edited on last line");
    inputLineFour.focus();

    const firstRemove = rows[0]!.querySelector('button[title="Remove"]') as HTMLButtonElement;
    await act(async () => {
      firstRemove.click();
      await flushMicrotasks();
    });

    rows = lineItemDataRows();
    expect(rows).toHaveLength(3);

    const descriptions = rows.map((r) => rowDescriptionInput(r).value);
    expect(descriptions).not.toContain("Line One");
    expect(descriptions).toEqual(["Line Two", "Line Three", "Edited on last line"]);

    // Controlled `.value` always matches state; stable uid keys preserve input node identity.
    expect(rowDescriptionInputForValue("Line Two")).toBe(inputLineTwo);
    expect(rowDescriptionInputForValue("Line Three")).toBe(inputLineThree);
    expect(rowDescriptionInputForValue("Edited on last line")).toBe(inputLineFour);

    expect(document.activeElement).toBe(rowDescriptionInputForValue("Edited on last line"));
  });

  it("same-row background refetch does not remount persisted line-item rows", async () => {
    const refreshedRowVersion = "rv-after-refetch";
    const queryClient = renderWithQueryClient();
    await waitForFourLineItems();
    await flushMicrotasks();

    const rowsBefore = lineItemDataRows();
    const inputsBefore = rowsBefore.map((row) => rowDescriptionInput(row));

    const expenseGetsBefore = mockGetOne.mock.calls.filter((c) => c[0] === EXPENSE_GET_PATH).length;
    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) {
        return Promise.resolve(
          sampleExpense({ is_draft: true, row_version: refreshedRowVersion }),
        );
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: entityItemKey(EXPENSE_GET_PATH) });
    });
    await flushUntil(
      () => container.querySelector(`#${WITNESS_ID}`)?.textContent === refreshedRowVersion,
    );

    const expenseGetsAfter = mockGetOne.mock.calls.filter((c) => c[0] === EXPENSE_GET_PATH).length;
    expect(expenseGetsAfter).toBeGreaterThan(expenseGetsBefore);
    expect(container.querySelector(`#${WITNESS_ID}`)?.textContent).toBe(refreshedRowVersion);

    const rowsAfter = lineItemDataRows();
    expect(rowsAfter).toHaveLength(4);
    const inputsAfter = rowsAfter.map((row) => rowDescriptionInput(row));
    // Re-hydrate with re-minted uids remounts every row; controlled inputs keep
    // .value but new DOM nodes — reference equality is the load-bearing check.
    for (let i = 0; i < inputsBefore.length; i++) {
      expect(inputsAfter[i]).toBe(inputsBefore[i]);
    }
  });

  it("created-in-session saved line keeps its DOM node across a subsequent same-row refetch", async () => {
    const savedPublicId = "li-session-new";
    const savedDescription = "New line in session";
    const refreshedExpenseRowVersion = "rv-after-refetch";

    mockGetListResolvedForAll({ data: [], count: 0 });
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/expense/exp-1") {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true }));
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/create/expense_line_item") {
        return Promise.resolve({
          public_id: savedPublicId,
          row_version: "rv-li-session-new",
        });
      }
      return Promise.reject(new Error("unexpected post: " + path));
    });

    const queryClient = renderWithQueryClient();
    await waitForCondition(() => container.textContent?.includes("Complete Expense") ?? false);
    await flushMicrotasks();

    const addRowBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add Row"),
    );
    expect(addRowBtn).toBeDefined();
    await act(async () => {
      addRowBtn!.click();
      await flushMicrotasks();
    });

    await flushUntil(() => inlineLineItemRows(container).length === 1);
    const row = inlineLineItemRows(container)[0]!;
    const descriptionInput = inlineLineItemInput(row);
    setInputValue(descriptionInput, savedDescription);

    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Save",
    ) as HTMLButtonElement | undefined;
    expect(saveBtn).toBeDefined();
    await act(async () => {
      saveBtn!.click();
      await flushMicrotasks();
    });

    const inputAfterSave = inlineLineItemInputForValue(container, savedDescription);
    expect(inputAfterSave).toBe(descriptionInput);

    const listCallsBefore = mockGetList.mock.calls.length;
    mockGetListResolvedForAll({
      data: [
        expenseLineItemFixture(savedPublicId, savedDescription, "5"),
      ],
      count: 1,
    });
    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) {
        return Promise.resolve(
          sampleExpense({ is_draft: true, row_version: refreshedExpenseRowVersion }),
        );
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: entityItemKey(EXPENSE_GET_PATH) });
    });
    await flushUntil(
      () => container.querySelector(`#${WITNESS_ID}`)?.textContent === refreshedExpenseRowVersion,
    );

    expect(container.querySelector(`#${WITNESS_ID}`)?.textContent).toBe(refreshedExpenseRowVersion);
    expect(mockGetList.mock.calls.length).toBe(listCallsBefore);

    expect(inlineLineItemInputForValue(container, savedDescription)).toBe(inputAfterSave);
  });
});

describe("ExpenseEdit chained-save row_version", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) {
        // row_version "rv-1" (the fixture default) is the stale token the
        // chained save must NOT resend after the flush PUT returns "rv-2".
        return Promise.resolve(sampleExpense({ row_version: "rv-1" }));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    mockGetListResolvedForAll({ data: [], count: 0 });

    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/expense/exp-1") {
        return Promise.resolve(sampleExpense({ row_version: "rv-2" }));
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/complete/expense/exp-1") {
        return Promise.resolve({});
      }
      return Promise.reject(new Error("unexpected post: " + path));
    });

    vi.stubGlobal("confirm", vi.fn(() => true));

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
    vi.unstubAllGlobals();
  });

  function headerPutBodies(): { row_version?: string }[] {
    return mockPut.mock.calls
      .filter((c) => c[0] === "/api/v1/update/expense/exp-1")
      .map((c) => c[1] as { row_version?: string });
  }

  it("a coalesced follow-up save sends the token returned by the in-flight PUT, not stale form state", async () => {
    let releaseFirstPut!: () => void;
    const firstPutHeld = new Promise<void>((resolve) => { releaseFirstPut = resolve; });
    let headerPuts = 0;
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/expense/exp-1") {
        headerPuts += 1;
        const response = sampleExpense({ row_version: "rv-2" });
        return headerPuts === 1 ? firstPutHeld.then(() => response) : Promise.resolve(response);
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    renderExpenseEdit(root);
    await waitForReady(container);
    await flushMicrotasks();

    const refInput = container.querySelector('input[name="reference_number"]') as HTMLInputElement;
    expect(refInput).not.toBeNull();
    await act(async () => { setInputValue(refInput, "EXP-EDITED"); });
    expect(headerPutBodies()).toHaveLength(0);

    await act(async () => { await vi.advanceTimersByTimeAsync(320); });
    expect(headerPutBodies()).toHaveLength(1);

    await act(async () => { setInputValue(refInput, "EXP-EDITED-AGAIN"); });

    const btn = completeButton(container);
    expect(btn).not.toBeNull();
    await act(async () => { btn!.click(); });
    await act(async () => { releaseFirstPut(); await flushMicrotasks(); });
    await flushUntil(() => headerPutBodies().length >= 2);

    const bodies = headerPutBodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[0].row_version).toBe("rv-1");
    expect(bodies[1].row_version).toBe("rv-2");
  });

  it("a keystroke typed while the flush PUT is in flight is carried by saveAll's own header PUT (Pass 1 P2)", async () => {
    let releaseFirstPut!: () => void;
    const firstPutHeld = new Promise<void>((resolve) => { releaseFirstPut = resolve; });
    let headerPuts = 0;
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/expense/exp-1") {
        headerPuts += 1;
        const response = sampleExpense({ row_version: `rv-${headerPuts + 1}` });
        return headerPuts === 1 ? firstPutHeld.then(() => response) : Promise.resolve(response);
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    renderExpenseEdit(root);
    await waitForReady(container);
    await flushMicrotasks();

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => { setTextareaValue(memo, "a"); });

    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Save")!;
    await act(async () => { saveBtn.click(); await flushMicrotasks(); });
    expect(headerPutBodies()).toHaveLength(1);

    await act(async () => { setTextareaValue(memo, "ab"); });

    await act(async () => { releaseFirstPut(); await flushMicrotasks(); });
    await flushUntil(() => headerPutBodies().length >= 2);

    const bodies = headerPutBodies() as { memo?: string | null }[];
    expect(bodies).toHaveLength(2);
    expect(bodies[0].memo).toBe("a");
    expect(bodies[1].memo).toBe("ab");
  });

  it("line inputs stay disabled while saveAll's flush PUT is in flight (U-621b W1)", async () => {
    let releaseFlush!: () => void;
    const flushHeld = new Promise<void>((resolve) => { releaseFlush = resolve; });
    let headerPuts = 0;
    mockGetListWithCodingCatalog((path) => {
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return Promise.resolve({
          data: [
            {
              public_id: "li-1",
              row_version: "rv-li",
              description: "seed",
              sub_cost_code_id: null,
              project_id: null,
              quantity: null,
              rate: null,
              amount: null,
              is_billable: true,
              billable_decided_at: null,
              markup: null,
              price: null,
            },
          ],
          count: 1,
        });
      }
      return Promise.resolve({ data: [], count: 0 });
    });
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/expense/exp-1") {
        headerPuts += 1;
        const response = sampleExpense({ row_version: `rv-${headerPuts + 1}` });
        return headerPuts === 1 ? flushHeld.then(() => response) : Promise.resolve(response);
      }
      if (path === "/api/v1/update/expense_line_item/li-1") {
        return Promise.resolve({ public_id: "li-1", row_version: "rv-li-2" });
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    renderExpenseEdit(root);
    await waitForReady(container);
    await flushMicrotasks();
    await flushUntil(() => inlineLineItemRows(container).length === 1);

    const row = inlineLineItemRows(container)[0]!;
    await act(async () => { setInputValue(inlineLineItemInput(row), "before-save"); });
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => { setTextareaValue(memo, "flush-me"); });

    const saveBtn = findSaveButton(container);
    await act(async () => { saveBtn.click(); await flushMicrotasks(); });
    expect(headerPutBodies()).toHaveLength(1);

    const lineInput = inlineLineItemInput(row);
    expect(lineInput.matches(":disabled")).toBe(true);

    await act(async () => { releaseFlush(); await flushMicrotasks(); });
    await flushUntilHard(
      () => mockPut.mock.calls.some((c) => c[0] === "/api/v1/update/expense_line_item/li-1"),
      "line PUT after flush",
    );
    expect(lineInput.matches(":disabled")).toBe(false);
  });

  it("Complete path: line inputs stay disabled while saveAll's flush PUT is in flight (U-621b C1)", async () => {
    let releaseFlush!: () => void;
    const flushHeld = new Promise<void>((resolve) => { releaseFlush = resolve; });
    let headerPuts = 0;
    mockGetListWithCodingCatalog((path) => {
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return Promise.resolve({
          data: [
            {
              public_id: "li-1",
              row_version: "rv-li",
              description: "seed",
              sub_cost_code_id: null,
              project_id: null,
              quantity: null,
              rate: null,
              amount: null,
              is_billable: true,
              billable_decided_at: null,
              markup: null,
              price: null,
            },
          ],
          count: 1,
        });
      }
      return Promise.resolve({ data: [], count: 0 });
    });
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/expense/exp-1") {
        headerPuts += 1;
        const response = sampleExpense({ row_version: `rv-${headerPuts + 1}` });
        return headerPuts === 1 ? flushHeld.then(() => response) : Promise.resolve(response);
      }
      if (path === "/api/v1/update/expense_line_item/li-1") {
        return Promise.resolve({ public_id: "li-1", row_version: "rv-li-2" });
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    renderExpenseEdit(root);
    await waitForReady(container);
    await flushMicrotasks();
    await flushUntil(() => inlineLineItemRows(container).length === 1);

    const row = inlineLineItemRows(container)[0]!;
    await act(async () => { setInputValue(inlineLineItemInput(row), "before-complete"); });
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => { setTextareaValue(memo, "flush-me"); });

    const completeBtn = completeButton(container);
    await act(async () => { completeBtn!.click(); await flushMicrotasks(); });
    expect(headerPutBodies()).toHaveLength(1);

    const lineInput = inlineLineItemInput(row);
    expect(lineInput.matches(":disabled")).toBe(true);

    await act(async () => { releaseFlush(); await flushMicrotasks(); });
    await flushUntilHard(
      () => mockPost.mock.calls.some((c) => c[0] === "/api/v1/complete/expense/exp-1"),
      "POST /complete/expense after flush",
    );
    expect(lineInput.matches(":disabled")).toBe(false);
  });

  it("a second Save clicked while the flush PUT is held joins the first — ONE create per new line (U-621 re-review P1)", async () => {
    let releaseFlush!: () => void;
    const flushHeld = new Promise<void>((resolve) => { releaseFlush = resolve; });
    let headerPuts = 0;
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/expense/exp-1") {
        headerPuts += 1;
        const response = sampleExpense({ row_version: `rv-${headerPuts + 1}` });
        return headerPuts === 1 ? flushHeld.then(() => response) : Promise.resolve(response);
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });
    mockPost.mockImplementation((path: string, body: Record<string, unknown>) =>
      path === LINE_CREATE_PATH
        ? Promise.resolve({ public_id: `li-${String(body.description)}`, row_version: "rv-new" })
        : Promise.reject(new Error("unexpected post: " + path)),
    );

    renderExpenseEdit(root);
    await waitForReady(container);
    await flushMicrotasks();

    await act(async () => { findAddRowButton(container).click(); });
    await flushUntil(() => inlineLineItemRows(container).length === 1);
    await act(async () => { setInputValue(inlineLineItemInput(inlineLineItemRows(container)[0]!), "new-line"); });
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => { setTextareaValue(memo, "a"); });

    const saveBtn = findSaveButton(container);
    await act(async () => { saveBtn.click(); await flushMicrotasks(); });
    expect(headerPutBodies()).toHaveLength(1);
    await act(async () => { saveBtn.click(); await flushMicrotasks(); });

    await act(async () => { releaseFlush(); await flushMicrotasks(); });
    await flushUntil(() => postCallsForDescription("new-line").length >= 1);
    await flushMicrotasks();

    expect(postCallsForDescription("new-line")).toHaveLength(1);
  });

  it("Complete on an untouched draft issues no header PUT at all", async () => {
    renderExpenseEdit(root);
    await waitForReady(container);
    await flushMicrotasks();

    const btn = completeButton(container);
    expect(btn).not.toBeNull();
    await act(async () => { btn!.click(); await flushMicrotasks(); });
    await flushUntilHard(
      () => mockPost.mock.calls.some((c) => c[0] === "/api/v1/complete/expense/exp-1"),
      "POST /complete/expense",
    );

    expect(headerPutBodies()).toHaveLength(0);
    expect(mockPost.mock.calls.filter((c) => c[0] === "/api/v1/complete/expense/exp-1")).toHaveLength(1);
  });

  it("clears a stale save-error banner when saveAll early-returns on a clean form via Submit for Review (U-621b C2)", async () => {
    vi.mocked(ReviewTimeline).mockImplementation((props: { onBeforeAction?: () => Promise<boolean> }) =>
      createElement(
        "button",
        {
          type: "button",
          "data-testid": "review-submit-stub",
          onClick: async () => {
            if (props.onBeforeAction) {
              const ok = await props.onBeforeAction();
              if (!ok) return;
            }
            await mockPost(REVIEW_SUBMIT_PATH, { comments: null });
          },
        },
        "Submit for Review",
      ),
    );

    let completeAttempts = 0;
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/complete/expense/exp-1") {
        completeAttempts += 1;
        if (completeAttempts === 1) return Promise.reject(new Error("complete failed"));
        return Promise.resolve({});
      }
      if (path === REVIEW_SUBMIT_PATH) return Promise.resolve({});
      return Promise.reject(new Error("unexpected post: " + path));
    });

    renderExpenseEdit(root);
    await waitForReady(container);
    await flushMicrotasks();

    const completeBtn = completeButton(container);
    await act(async () => { completeBtn!.click(); await flushMicrotasks(); });
    await flushUntilHard(() => container.textContent?.includes("complete failed") ?? false, "complete error shown");
    expect(headerPutBodies()).toHaveLength(0);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-submit-stub"]')!.click();
      await flushMicrotasks();
    });
    await flushUntilHard(
      () => mockPost.mock.calls.some((c) => c[0] === REVIEW_SUBMIT_PATH),
      "review submit POST on clean form",
    );
    expect(container.textContent?.includes("complete failed")).toBe(false);
    expect(headerPutBodies()).toHaveLength(0);
  });
});

describe("ExpenseEdit token rebase (U-471)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  function render() {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/expense/exp-1/edit"] },
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: "/expense/:publicId/edit",
                element: createElement(ExpenseEdit),
              }),
            ),
          ),
        ),
      );
    });
  }

  function cachedExpense() {
    return queryClient.getQueryData<Expense>(entityItemKey(EXPENSE_GET_PATH));
  }

  function headerPutBodies(): Record<string, unknown>[] {
    return mockPut.mock.calls
      .filter((c) => c[0] === "/api/v1/update/expense/exp-1")
      .map((c) => c[1] as Record<string, unknown>);
  }

  async function clickSave() {
    const btn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Save",
    );
    expect(btn).toBeDefined();
    await act(async () => {
      btn!.click();
    });
    await flushUntil(() => {
      const b = Array.from(container.querySelectorAll("button")).find(
        (x) => x.textContent?.trim() === "Save" || x.textContent?.trim() === "Saving...",
      );
      return b?.textContent?.trim() === "Save";
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) return Promise.resolve(sampleExpense());
      return Promise.reject(new Error("unexpected getOne: " + path));
    });
    mockGetListResolvedForAll({ data: [], count: 0 });
    mockPut.mockImplementation((path: string, body: Record<string, unknown>) => {
      if (path === "/api/v1/update/expense/exp-1") {
        return Promise.resolve(sampleExpense({
          row_version: "rv-2",
          memo: (body.memo as string | null) ?? "",
        }));
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });
    mockPost.mockResolvedValue({});
    mockDel.mockResolvedValue({});
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

  it("does NOT rebase the token when a co-editor changes memo — banner instead", async () => {
    render();
    await waitForReady(container);

    act(() => {
      queryClient.setQueryData(entityItemKey(EXPENSE_GET_PATH), sampleExpense({
        row_version: "rv-co-editor",
        memo: "from another window",
      }));
    });
    await flushUntil(() => cachedExpense()?.memo === "from another window");

    await flushUntil(() => container.textContent?.includes("This expense was changed in another window.") ?? false);
    expect(container.textContent).toContain("This expense was changed in another window.");

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => { setTextareaValue(memo, "my local edit"); });

    await clickSave();
    const bodies = headerPutBodies();
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[bodies.length - 1].row_version).toBe("rv-1");
    expect(bodies[bodies.length - 1].row_version).not.toBe("rv-co-editor");
  });

  it("saveAll: an arrival carrying the saved values is NOT diverged", async () => {
    render();
    await waitForReady(container);

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(memo, "saved via saveAll");
    });
    await clickSave();
    expect(headerPutBodies().length).toBeGreaterThan(0);

    act(() => {
      queryClient.setQueryData(entityItemKey(EXPENSE_GET_PATH), sampleExpense({
        row_version: "rv-2",
        memo: "saved via saveAll",
      }));
    });
    await flushUntil(() => cachedExpense()?.memo === "saved via saveAll");
    expect(container.textContent).not.toContain("This expense was changed in another window.");
  });

  it("autoSaveHeader: an arrival carrying the saved values is NOT diverged", async () => {
    render();
    await waitForReady(container);

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(memo, "saved via autosave");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await flushUntil(() => headerPutBodies().length > 0);

    act(() => {
      queryClient.setQueryData(entityItemKey(EXPENSE_GET_PATH), sampleExpense({
        row_version: "rv-2",
        memo: "saved via autosave",
      }));
    });
    await flushUntil(() => cachedExpense()?.memo === "saved via autosave");
    expect(container.textContent).not.toContain("This expense was changed in another window.");
  });
});

describe("ExpenseEdit saveAll incremental line-item sync (U-170 / U-476)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) return Promise.resolve(sampleExpense({ is_draft: true }));
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    mockGetListResolvedForAll({
      data: [expenseLineItemFixture("li-1", "existing", "100.00")],
      count: 1,
    });

    mockPut.mockImplementation((path: string) => {
      if (path === EXPENSE_UPDATE_PATH) {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true }));
      }
      if (path.startsWith("/api/v1/update/expense_line_item/")) {
        const id = path.split("/").pop()!;
        return Promise.resolve({ public_id: id, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    mockPost.mockRejectedValue(new Error("unexpected post"));
    mockDel.mockResolvedValue({});

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

  it("a mid-loop failure leaves state safe to retry", async () => {
    let newBPostAttempts = 0;

    mockPost.mockImplementation((path: string, body: Record<string, unknown>) => {
      if (path !== LINE_CREATE_PATH) {
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

    renderExpenseEdit(root);
    await flushUntil(() => inlineLineItemRows(container).length === 1);
    expect(inlineLineItemRows(container)).toHaveLength(1);

    await act(async () => {
      findAddRowButton(container).click();
    });
    await flushUntil(() => inlineLineItemRows(container).length === 2);

    await act(async () => {
      findAddRowButton(container).click();
    });
    await flushUntil(() => inlineLineItemRows(container).length === 3);
    expect(inlineLineItemRows(container)).toHaveLength(3);

    await act(async () => {
      const rows = inlineLineItemRows(container);
      setInputValue(inlineLineItemInput(rows[1]!), "new-A");
      setInputValue(inlineLineItemInput(rows[2]!), "new-B");
    });

    expect(inlineLineItemInput(inlineLineItemRows(container)[1]!).value).toBe("new-A");
    expect(inlineLineItemInput(inlineLineItemRows(container)[2]!).value).toBe("new-B");

    await clickSave(container);
    expect(container.textContent).toContain("boom");

    await clickSave(container);

    expect(postCallsForDescription("new-A")).toHaveLength(1);

    const li9Puts = putCallsForLineItem("li-9");
    expect(li9Puts.map(([, body]) => body.description)).toContain("new-A");

    const li1Puts = putCallsForLineItem("li-1");
    expect(li1Puts.length).toBeGreaterThanOrEqual(2);
    expect(li1Puts[0][1].row_version).toBe("rv-1");
    expect(li1Puts[1][1].row_version).toBe("rv-1b");
    expect(li1Puts[1][1].row_version).not.toBe("rv-1");
  });

  it("commits DELETE progress so a retry does not re-DELETE a gone row", async () => {
    mockGetListResolvedForAll({
      data: [
        expenseLineItemFixture("li-1", "line-1", "50.00"),
        expenseLineItemFixture("li-2", "line-2", "50.00"),
      ],
      count: 2,
    });

    let li2PutAttempts = 0;
    mockPut.mockImplementation((path: string) => {
      if (path === EXPENSE_UPDATE_PATH) {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true }));
      }
      if (path === "/api/v1/update/expense_line_item/li-2") {
        li2PutAttempts += 1;
        if (li2PutAttempts === 1) {
          return Promise.reject(new Error("li-2 fail"));
        }
        return Promise.resolve({ public_id: "li-2", row_version: "rv-2b" });
      }
      if (path.startsWith("/api/v1/update/expense_line_item/")) {
        const id = path.split("/").pop()!;
        return Promise.resolve({ public_id: id, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    renderExpenseEdit(root);
    await flushUntil(() => inlineLineItemRows(container).length === 2);
    expect(inlineLineItemRows(container)).toHaveLength(2);

    const removeButtons = container.querySelectorAll('button[title="Remove"]');
    expect(removeButtons.length).toBe(2);

    await act(async () => {
      removeButtons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await flushUntil(() => inlineLineItemRows(container).length === 1);
    expect(inlineLineItemInput(inlineLineItemRows(container)[0]!).value).toBe("line-2");

    await clickSave(container);
    await flushUntil(() => container.textContent?.includes("li-2 fail") ?? false);
    expect(container.textContent).toContain("li-2 fail");

    await clickSave(container);

    expect(lineDeletesFor("li-1")).toHaveLength(1);
  });

  it("a row created in one save and removed in a later save is deleted server-side", async () => {
    const createdId = "li-created";
    mockGetListResolvedForAll({ data: [], count: 0 });
    mockPost.mockImplementation((path: string) => {
      if (path === LINE_CREATE_PATH) {
        return Promise.resolve({ public_id: createdId, row_version: "rv-created" });
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });

    renderExpenseEdit(root);
    await waitForReady(container);
    await flushMicrotasks();

    await act(async () => {
      findAddRowButton(container).click();
    });
    await flushUntil(() => inlineLineItemRows(container).length === 1);

    await act(async () => {
      setInputValue(inlineLineItemInput(inlineLineItemRows(container)[0]!), "created-in-session");
    });

    await clickSave(container);
    expect(postCallsForDescription("created-in-session")).toHaveLength(1);

    const removeBtn = container.querySelector('button[title="Remove"]');
    expect(removeBtn).not.toBeNull();
    await act(async () => {
      removeBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushUntil(() => inlineLineItemRows(container).length === 0);

    mockDel.mockClear();
    await clickSave(container);

    expect(lineDeletesFor(createdId)).toHaveLength(1);
  });
});

describe("ExpenseEdit receipt re-homing on line delete (U-171 / U-476)", () => {
  const ATT_ID = 55;

  let container: HTMLDivElement;
  let root: Root;

  function setup(
    lines: ReturnType<typeof expenseLineItemFixture>[],
    elia: Record<string, { linkId: string; attachmentId: number | null } | null>,
  ) {
    mockGetOne.mockImplementation((path: string) => {
      if (path === EXPENSE_GET_PATH) return Promise.resolve(sampleExpense({ is_draft: true }));
      const m = path.match(/^\/api\/v1\/get\/expense-line-item-attachment\/by-expense-line-item\/(.+)$/);
      if (m) {
        const link = elia[m[1]];
        return link
          ? Promise.resolve({ public_id: link.linkId, attachment_id: link.attachmentId })
          : Promise.reject(new ApiError(404, "Not found"));
      }
      if (path === `/api/v1/get/attachment/id/${ATT_ID}`) {
        return Promise.resolve({ public_id: "att-55" });
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });
    mockGetListResolvedForAll({ data: lines, count: lines.length });
    mockPut.mockImplementation((path: string) => {
      if (path === EXPENSE_UPDATE_PATH) {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true }));
      }
      if (path.startsWith("/api/v1/update/expense_line_item/")) {
        return Promise.resolve({ public_id: path.split("/").pop()!, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });
    mockDel.mockResolvedValue({});
  }

  const twoLines = () => [
    expenseLineItemFixture("li-A", "line-A", "10"),
    expenseLineItemFixture("li-B", "line-B", "20"),
  ];

  async function removeFirstRow() {
    await flushUntil(() => inlineLineItemRows(container).length === 2);
    const removeButtons = container.querySelectorAll('button[title="Remove"]');
    await act(async () => {
      removeButtons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushUntil(() => inlineLineItemRows(container).length === 1);
  }

  const called = (mock: typeof mockPost, p: string) =>
    mock.mock.calls.some((c) => c[0] === p);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
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

  it("re-homes the receipt to a surviving line BEFORE deleting the first line (create-before-delete)", async () => {
    setup(twoLines(), { "li-A": { linkId: "elia-A", attachmentId: ATT_ID }, "li-B": null });
    mockPost.mockImplementation((path: string) =>
      path === ELIA_CREATE_PATH
        ? Promise.resolve({ public_id: "elia-new", attachment_id: ATT_ID })
        : Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await removeFirstRow();
    await clickSave(container);

    const rehome = mockPost.mock.calls.filter((c) => c[0] === ELIA_CREATE_PATH);
    expect(rehome).toHaveLength(1);
    expect((rehome[0][1] as Record<string, unknown>).expense_line_item_public_id).toBe("li-B");
    expect((rehome[0][1] as Record<string, unknown>).attachment_public_id).toBe("att-55");
    expect(called(mockDel, "/api/v1/delete/expense-line-item-attachment/elia-A")).toBe(true);
    expect(called(mockDel, "/api/v1/delete/expense_line_item/li-A")).toBe(true);

    const postOrder =
      mockPost.mock.invocationCallOrder[
        mockPost.mock.calls.findIndex((c) => c[0] === ELIA_CREATE_PATH)
      ];
    const oldLinkDelOrder =
      mockDel.mock.invocationCallOrder[
        mockDel.mock.calls.findIndex(
          (c) => c[0] === "/api/v1/delete/expense-line-item-attachment/elia-A",
        )
      ];
    const lineDelOrder =
      mockDel.mock.invocationCallOrder[
        mockDel.mock.calls.findIndex(
          (c) => c[0] === "/api/v1/delete/expense_line_item/li-A",
        )
      ];
    expect(postOrder).toBeLessThan(oldLinkDelOrder);
    expect(postOrder).toBeLessThan(lineDelOrder);
  });

  it("drops the old link WITHOUT re-creating when a survivor already holds the same attachment (retry-safe)", async () => {
    setup(twoLines(), {
      "li-A": { linkId: "elia-A", attachmentId: ATT_ID },
      "li-B": { linkId: "elia-B", attachmentId: ATT_ID },
    });
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await removeFirstRow();
    await clickSave(container);

    expect(called(mockPost, ELIA_CREATE_PATH)).toBe(false);
    expect(called(mockDel, "/api/v1/delete/expense-line-item-attachment/elia-A")).toBe(true);
    expect(called(mockDel, "/api/v1/delete/expense_line_item/li-A")).toBe(true);
    expect(container.textContent).not.toContain("Could not preserve");
  });

  it("aborts the save and issues NO delete when no surviving line exists", async () => {
    setup(
      [expenseLineItemFixture("li-A", "line-A", "10")],
      { "li-A": { linkId: "elia-A", attachmentId: ATT_ID } },
    );
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await flushUntil(() => inlineLineItemRows(container).length === 1);
    const removeButtons = container.querySelectorAll('button[title="Remove"]');
    await act(async () => {
      removeButtons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushUntil(() => inlineLineItemRows(container).length === 0);

    await clickSave(container);

    expect(lineDeletesFor("li-A")).toHaveLength(0);
    expect(mockDel).not.toHaveBeenCalled();
    expect(expenseHeaderPutBodies()).toHaveLength(0);
    expect(container.textContent).toContain(
      "Could not preserve this expense's receipt — nothing was saved and the line was not removed.",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("aborts the save and issues NO delete when the re-home call fails", async () => {
    setup(twoLines(), { "li-A": { linkId: "elia-A", attachmentId: ATT_ID }, "li-B": null });
    mockPost.mockImplementation((path: string) =>
      path === ELIA_CREATE_PATH
        ? Promise.reject(new Error("rehome failed"))
        : Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await removeFirstRow();
    await clickSave(container);

    expect(called(mockDel, "/api/v1/delete/expense_line_item/li-A")).toBe(false);
    expect(lineDeletesFor("li-A")).toHaveLength(0);
    expect(expenseHeaderPutBodies()).toHaveLength(0);
    expect(container.textContent).toContain("rehome failed");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // U-476 /em mutation-check follow-up. Deleting the identity verification that
  // follows the idempotent create left all 18 specs GREEN — a surviving mutant,
  // so the guard was load-bearing and untested. The create endpoint is
  // idempotent: handed a line that ALREADY has a link it returns that existing
  // row instead of creating one. The helper only targets a survivor whose link
  // GET 404'd, so reaching this needs a racing writer linking the target between
  // the scan and the create. If that happens and we trust the response, the
  // very next statement deletes the ORIGINAL link and the receipt is orphaned —
  // the exact loss this unit exists to prevent, one race away.
  it("aborts rather than trust an idempotent create that returned a DIFFERENT attachment", async () => {
    setup(twoLines(), { "li-A": { linkId: "elia-A", attachmentId: ATT_ID }, "li-B": null });
    mockPost.mockImplementation((path: string) =>
      path === ELIA_CREATE_PATH
        ? // A racing writer got there first: the pre-existing row is someone
          // else's attachment, NOT our receipt.
          Promise.resolve({ public_id: "elia-other", attachment_id: ATT_ID + 44 })
        : Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await removeFirstRow();
    await clickSave(container);

    // The original link must survive: dropping it is what destroys the blob.
    expect(called(mockDel, "/api/v1/delete/expense-line-item-attachment/elia-A")).toBe(false);
    expect(called(mockDel, "/api/v1/delete/expense_line_item/li-A")).toBe(false);
    expect(lineDeletesFor("li-A")).toHaveLength(0);
    expect(expenseHeaderPutBodies()).toHaveLength(0);
    expect(container.textContent).toContain(
      "Could not preserve this expense's receipt — nothing was saved and the line was not removed.",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("aborts with ZERO creates and ZERO deletes when two different receipts compete for one link-free survivor", async () => {
    const ATT_B = 77;
    setup(
      [
        expenseLineItemFixture("li-A", "line-A", "10"),
        expenseLineItemFixture("li-B", "line-B", "20"),
        expenseLineItemFixture("li-C", "line-C", "30"),
      ],
      {
        "li-A": { linkId: "elia-A", attachmentId: ATT_ID },
        "li-B": { linkId: "elia-B", attachmentId: ATT_B },
        "li-C": null,
      },
    );
    mockPost.mockImplementation((path: string) => {
      if (path === EXPENSE_CODING_SUGGEST_PATH) {
        return Promise.resolve({
          status: "none",
          sub_cost_code: null,
          project: null,
          confidence: null,
        });
      }
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });

    renderExpenseEdit(root);
    await flushUntil(() => inlineLineItemRows(container).length === 3);
    const firstRemove = container.querySelectorAll('button[title="Remove"]');
    await act(async () => {
      firstRemove[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushUntil(() => inlineLineItemRows(container).length === 2);
    const secondRemove = container.querySelectorAll('button[title="Remove"]');
    await act(async () => {
      secondRemove[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushUntil(() => inlineLineItemRows(container).length === 1);

    await clickSave(container);

    expect(mockPost.mock.calls.every((c) => c[0] === EXPENSE_CODING_SUGGEST_PATH)).toBe(true);
    expect(mockDel).not.toHaveBeenCalled();
    expect(expenseHeaderPutBodies()).toHaveLength(0);
    expect(container.textContent).toContain(
      "Could not preserve this expense's receipt — nothing was saved and the line was not removed.",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("a non-404 failure on a REMOVED line's link GET aborts the save and issues NO delete", async () => {
    setup(twoLines(), { "li-A": { linkId: "elia-A", attachmentId: ATT_ID }, "li-B": null });
    const innerGetOne = mockGetOne.getMockImplementation()!;
    mockGetOne.mockImplementation((path: string) => {
      if (path === `${ELIA_BY_LINE_PREFIX}li-A`) {
        return Promise.reject(new ApiError(500, "boom"));
      }
      return innerGetOne(path);
    });
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await removeFirstRow();
    await clickSave(container);

    expect(mockDel).not.toHaveBeenCalled();
    expect(called(mockDel, "/api/v1/delete/expense-line-item-attachment/elia-A")).toBe(false);
    expect(called(mockDel, "/api/v1/delete/expense_line_item/li-A")).toBe(false);
    expect(expenseHeaderPutBodies()).toHaveLength(0);
    expect(container.textContent).toContain("boom");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("a non-404 failure on a SURVIVOR's link GET aborts the save and issues NO delete", async () => {
    setup(twoLines(), { "li-A": { linkId: "elia-A", attachmentId: ATT_ID }, "li-B": null });
    const innerGetOne = mockGetOne.getMockImplementation()!;
    mockGetOne.mockImplementation((path: string) => {
      if (path === `${ELIA_BY_LINE_PREFIX}li-B`) {
        return Promise.reject(new ApiError(502, "boom"));
      }
      return innerGetOne(path);
    });
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await removeFirstRow();
    await clickSave(container);

    expect(mockDel).not.toHaveBeenCalled();
    expect(called(mockDel, "/api/v1/delete/expense_line_item/li-A")).toBe(false);
    expect(expenseHeaderPutBodies()).toHaveLength(0);
    expect(container.textContent).toContain("boom");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("does not create a duplicate link when a later survivor already holds the receipt", async () => {
    setup(
      [
        expenseLineItemFixture("li-A", "line-A", "10"),
        expenseLineItemFixture("li-B", "line-B", "20"),
        expenseLineItemFixture("li-C", "line-C", "30"),
      ],
      {
        "li-A": { linkId: "elia-A", attachmentId: ATT_ID },
        "li-B": null,
        "li-C": { linkId: "elia-C", attachmentId: ATT_ID },
      },
    );
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await flushUntil(() => inlineLineItemRows(container).length === 3);
    const removeButtons = container.querySelectorAll('button[title="Remove"]');
    await act(async () => {
      removeButtons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushUntil(() => inlineLineItemRows(container).length === 2);

    await clickSave(container);

    expect(called(mockPost, ELIA_CREATE_PATH)).toBe(false);
    expect(called(mockDel, "/api/v1/delete/expense-line-item-attachment/elia-A")).toBe(true);
    expect(called(mockDel, "/api/v1/delete/expense_line_item/li-A")).toBe(true);
    expect(container.textContent).not.toContain("Could not preserve");
  });

  it("does not GET /attachment/id/null when the removed line's link has a null attachment_id", async () => {
    setup(twoLines(), { "li-A": { linkId: "elia-A", attachmentId: null }, "li-B": null });
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await removeFirstRow();
    await clickSave(container);

    const paths = allMockedClientPaths();
    expect(paths).not.toContain("/api/v1/get/attachment/id/null");
    expect(
      mockGetOne.mock.calls.some((c) => String(c[0]).includes("/attachment/id/null")),
    ).toBe(false);
    expect(called(mockDel, "/api/v1/delete/expense_line_item/li-A")).toBe(true);
    expect(container.textContent).not.toContain("Could not preserve");
  });

  it("restores the removed row when receipt preservation aborts so a later save of other fields can proceed", async () => {
    setup(
      [expenseLineItemFixture("li-A", "line-A", "10")],
      { "li-A": { linkId: "elia-A", attachmentId: ATT_ID } },
    );
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await flushUntil(() => inlineLineItemRows(container).length === 1);
    const removeButtons = container.querySelectorAll('button[title="Remove"]');
    await act(async () => {
      removeButtons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushUntil(() => inlineLineItemRows(container).length === 0);

    await clickSave(container);

    expect(container.textContent).toContain(
      "Could not preserve this expense's receipt — nothing was saved and the line was not removed.",
    );
    await flushUntil(() => inlineLineItemRows(container).length === 1);
    expect(inlineLineItemRows(container)).toHaveLength(1);
    expect(inlineLineItemInput(inlineLineItemRows(container)[0]!).value).toBe("line-A");
    expect(lineDeletesFor("li-A")).toHaveLength(0);
    expect(expenseHeaderPutBodies()).toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalled();

    mockPut.mockClear();
    mockDel.mockClear();
    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    expect(memo).not.toBeNull();
    await act(async () => {
      setTextareaValue(memo, "kept after restore");
    });
    await clickSave(container);

    expect(container.textContent).not.toContain("Could not preserve");
    const puts = expenseHeaderPutBodies();
    expect(puts.length).toBeGreaterThan(0);
    expect(puts[puts.length - 1].memo).toBe("kept after restore");
    expect(lineDeletesFor("li-A")).toHaveLength(0);
    expect(mockNavigate).toHaveBeenCalledWith("/expense/exp-1");
  });

  it("does not restore a removed row when a non-rehome save step fails", async () => {
    setup(twoLines(), { "li-A": null, "li-B": null });
    mockPut.mockImplementation((path: string) => {
      if (path === EXPENSE_UPDATE_PATH) {
        return Promise.reject(new Error("header fail"));
      }
      if (path.startsWith("/api/v1/update/expense_line_item/")) {
        return Promise.resolve({ public_id: path.split("/").pop()!, row_version: "rv-1b" });
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await removeFirstRow();
    expect(inlineLineItemInput(inlineLineItemRows(container)[0]!).value).toBe("line-B");

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => { setTextareaValue(memo, "edited header"); });

    await clickSave(container);

    expect(container.textContent).toContain("header fail");
    expect(inlineLineItemRows(container)).toHaveLength(1);
    expect(inlineLineItemInput(inlineLineItemRows(container)[0]!).value).toBe("line-B");
  });

  it("issues ZERO link deletes when a later group's identity check fails (creates all run first)", async () => {
    const ATT_B = 77;
    setup(
      [
        expenseLineItemFixture("li-A", "line-A", "10"),
        expenseLineItemFixture("li-B", "line-B", "20"),
        expenseLineItemFixture("li-C", "line-C", "30"),
        expenseLineItemFixture("li-D", "line-D", "40"),
      ],
      {
        "li-A": { linkId: "elia-A", attachmentId: ATT_ID },
        "li-B": { linkId: "elia-B", attachmentId: ATT_B },
        "li-C": null,
        "li-D": null,
      },
    );
    const innerGetOne = mockGetOne.getMockImplementation()!;
    mockGetOne.mockImplementation((path: string) => {
      if (path === `/api/v1/get/attachment/id/${ATT_B}`) {
        return Promise.resolve({ public_id: "att-77" });
      }
      return innerGetOne(path);
    });
    let eliaCreates = 0;
    mockPost.mockImplementation((path: string) => {
      if (path !== ELIA_CREATE_PATH) {
        return Promise.reject(new Error(`unexpected post: ${path}`));
      }
      eliaCreates += 1;
      if (eliaCreates === 1) {
        return Promise.resolve({ public_id: "elia-new-1", attachment_id: ATT_ID });
      }
      return Promise.resolve({ public_id: "elia-other", attachment_id: ATT_ID + 44 });
    });

    renderExpenseEdit(root);
    await flushUntil(() => inlineLineItemRows(container).length === 4);
    for (let i = 0; i < 2; i++) {
      const removeButtons = container.querySelectorAll('button[title="Remove"]');
      await act(async () => {
        removeButtons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    await flushUntil(() => inlineLineItemRows(container).length === 2);

    await clickSave(container);

    expect(mockPost.mock.calls.filter((c) => c[0] === ELIA_CREATE_PATH)).toHaveLength(2);
    expect(called(mockDel, "/api/v1/delete/expense-line-item-attachment/elia-A")).toBe(false);
    expect(called(mockDel, "/api/v1/delete/expense-line-item-attachment/elia-B")).toBe(false);
    expect(mockDel).not.toHaveBeenCalled();
    expect(expenseHeaderPutBodies()).toHaveLength(0);
    expect(container.textContent).toContain(
      "Could not preserve this expense's receipt — nothing was saved and the line was not removed.",
    );
  });

  it("saveAll flushes an armed auto-save debounce up front, so a slow re-home GET sees exactly one header PUT", async () => {
    let releaseLiA!: () => void;
    const liAHeld = new Promise<void>((resolve) => {
      releaseLiA = resolve;
    });

    setup(twoLines(), { "li-A": { linkId: "elia-A", attachmentId: ATT_ID }, "li-B": null });
    const innerGetOne = mockGetOne.getMockImplementation()!;
    mockGetOne.mockImplementation((path: string) => {
      if (path === `${ELIA_BY_LINE_PREFIX}li-A`) {
        return liAHeld.then(() => ({ public_id: "elia-A", attachment_id: ATT_ID }));
      }
      return innerGetOne(path);
    });
    mockPost.mockImplementation((path: string) =>
      path === ELIA_CREATE_PATH
        ? Promise.resolve({ public_id: "elia-new", attachment_id: ATT_ID })
        : Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await removeFirstRow();

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    expect(memo).not.toBeNull();
    await act(async () => {
      setTextareaValue(memo, "typed then immediately saved");
    });
    expect(expenseHeaderPutBodies()).toHaveLength(0);

    await act(async () => {
      findSaveButton(container).click();
    });
    await act(async () => {
      for (let i = 0; i < 40; i++) {
        await Promise.resolve();
      }
    });

    expect(expenseHeaderPutBodies()).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    expect(expenseHeaderPutBodies()).toHaveLength(1);

    await act(async () => {
      releaseLiA();
      for (let i = 0; i < 40; i++) {
        await Promise.resolve();
      }
    });
    await flushUntil(() => {
      const btn = Array.from(container.querySelectorAll("button")).find(
        (x) => x.textContent?.trim() === "Save" || x.textContent?.trim() === "Saving...",
      );
      return btn?.textContent?.trim() === "Save";
    });

    expect(expenseHeaderPutBodies()).toHaveLength(1);
  });

  it("assigns DISTINCT free survivors when two different receipts need a new home", async () => {
    const ATT_B = 77;
    setup(
      [
        expenseLineItemFixture("li-A", "line-A", "10"),
        expenseLineItemFixture("li-B", "line-B", "20"),
        expenseLineItemFixture("li-C", "line-C", "30"),
        expenseLineItemFixture("li-D", "line-D", "40"),
      ],
      {
        "li-A": { linkId: "elia-A", attachmentId: ATT_ID },
        "li-B": { linkId: "elia-B", attachmentId: ATT_B },
        "li-C": null,
        "li-D": null,
      },
    );
    const innerGetOne = mockGetOne.getMockImplementation()!;
    mockGetOne.mockImplementation((path: string) => {
      if (path === `/api/v1/get/attachment/id/${ATT_B}`) {
        return Promise.resolve({ public_id: "att-77" });
      }
      return innerGetOne(path);
    });
    mockPost.mockImplementation((path: string, body: Record<string, unknown>) => {
      if (path !== ELIA_CREATE_PATH) {
        return Promise.reject(new Error(`unexpected post: ${path}`));
      }
      const attPub = String(body.attachment_public_id);
      const attachmentId = attPub === "att-55" ? ATT_ID : ATT_B;
      return Promise.resolve({
        public_id: `elia-new-${attachmentId}`,
        attachment_id: attachmentId,
      });
    });

    renderExpenseEdit(root);
    await flushUntil(() => inlineLineItemRows(container).length === 4);
    for (let i = 0; i < 2; i++) {
      const removeButtons = container.querySelectorAll('button[title="Remove"]');
      await act(async () => {
        removeButtons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    await flushUntil(() => inlineLineItemRows(container).length === 2);

    await clickSave(container);

    const creates = mockPost.mock.calls.filter((c) => c[0] === ELIA_CREATE_PATH);
    expect(creates).toHaveLength(2);
    const targets = creates.map(
      (c) => (c[1] as Record<string, unknown>).expense_line_item_public_id,
    );
    expect(new Set(targets).size).toBe(2);
    expect(targets).toEqual(expect.arrayContaining(["li-C", "li-D"]));
  });

  it("re-homes a shared attachment once: one create and two old-link deletes", async () => {
    setup(
      [
        expenseLineItemFixture("li-A", "line-A", "10"),
        expenseLineItemFixture("li-B", "line-B", "20"),
        expenseLineItemFixture("li-C", "line-C", "30"),
      ],
      {
        "li-A": { linkId: "elia-A", attachmentId: ATT_ID },
        "li-B": { linkId: "elia-B", attachmentId: ATT_ID },
        "li-C": null,
      },
    );
    mockPost.mockImplementation((path: string) =>
      path === ELIA_CREATE_PATH
        ? Promise.resolve({ public_id: "elia-new", attachment_id: ATT_ID })
        : Promise.reject(new Error(`unexpected post: ${path}`)),
    );

    renderExpenseEdit(root);
    await flushUntil(() => inlineLineItemRows(container).length === 3);
    for (let i = 0; i < 2; i++) {
      const removeButtons = container.querySelectorAll('button[title="Remove"]');
      await act(async () => {
        removeButtons[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    await flushUntil(() => inlineLineItemRows(container).length === 1);

    await clickSave(container);

    const creates = mockPost.mock.calls.filter((c) => c[0] === ELIA_CREATE_PATH);
    expect(creates).toHaveLength(1);
    expect((creates[0][1] as Record<string, unknown>).expense_line_item_public_id).toBe("li-C");
    expect(called(mockDel, "/api/v1/delete/expense-line-item-attachment/elia-A")).toBe(true);
    expect(called(mockDel, "/api/v1/delete/expense-line-item-attachment/elia-B")).toBe(true);
    expect(
      mockDel.mock.calls.filter((c) =>
        String(c[0]).includes("expense-line-item-attachment"),
      ),
    ).toHaveLength(2);
    expect(container.textContent).not.toContain("Could not preserve");
  });
});

describe("ExpenseEdit auto-save disarm after failed save (U-476)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) return Promise.resolve(sampleExpense({ is_draft: true }));
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    mockGetListResolvedForAll({
      data: [expenseLineItemFixture("li-1", "existing", "10")],
      count: 1,
    });

    mockPut.mockImplementation((path: string) => {
      if (path === EXPENSE_UPDATE_PATH) {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true }));
      }
      if (path.startsWith("/api/v1/update/expense_line_item/")) {
        return Promise.reject(new Error("line fail"));
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    mockPost.mockRejectedValue(new Error("unexpected post"));
    mockDel.mockResolvedValue({});

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

  it("a failed save disarms auto-save", async () => {
    renderExpenseEdit(root);
    await waitForReady(container);
    await flushUntil(() => inlineLineItemRows(container).length === 1);

    const memoBefore = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => { setTextareaValue(memoBefore, "typed before save"); });
    await act(async () => {
      setInputValue(inlineLineItemInput(inlineLineItemRows(container)[0]!), "edited line");
    });

    await clickSave(container);
    await flushUntil(() => container.textContent?.includes("line fail") ?? false);
    expect(container.textContent).toContain("line fail");

    const putsAfterFail = expenseHeaderPutBodies().length;
    expect(putsAfterFail).toBeGreaterThan(0);

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    expect(memo).not.toBeNull();
    await act(async () => {
      setTextareaValue(memo, "typed after failed save");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await act(async () => {
      for (let i = 0; i < 40; i++) {
        await Promise.resolve();
      }
    });

    expect(expenseHeaderPutBodies()).toHaveLength(putsAfterFail);
  });

  it("a line-item failure after the header persisted does not re-dirty the header (next Save sends no header PUT)", async () => {
    renderExpenseEdit(root);
    await waitForReady(container);
    await flushUntil(() => inlineLineItemRows(container).length === 1);

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => { setTextareaValue(memo, "typed once"); });
    await act(async () => {
      setInputValue(inlineLineItemInput(inlineLineItemRows(container)[0]!), "edited line");
    });

    await clickSave(container);
    await flushUntil(() => container.textContent?.includes("line fail") ?? false);
    expect(expenseHeaderPutBodies()).toHaveLength(1);

    await clickSave(container);
    await flushUntil(() => mockPut.mock.calls.filter((c) => String(c[0]).startsWith("/api/v1/update/expense_line_item/")).length >= 2);
    expect(expenseHeaderPutBodies()).toHaveLength(1);
  });

  it("cancels an already-armed debounce so a failed save does not fire a follow-up header PUT", async () => {
    renderExpenseEdit(root);
    await waitForReady(container);
    await flushUntil(() => inlineLineItemRows(container).length === 1);

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    expect(memo).not.toBeNull();
    await act(async () => {
      setTextareaValue(memo, "typed before failing save");
    });
    await act(async () => {
      setInputValue(inlineLineItemInput(inlineLineItemRows(container)[0]!), "edited line");
    });
    expect(expenseHeaderPutBodies()).toHaveLength(0);

    await clickSave(container);
    await flushUntil(() => container.textContent?.includes("line fail") ?? false);
    expect(container.textContent).toContain("line fail");

    const putsAfterFail = expenseHeaderPutBodies().length;
    expect(putsAfterFail).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    await act(async () => {
      for (let i = 0; i < 40; i++) {
        await Promise.resolve();
      }
    });

    expect(expenseHeaderPutBodies()).toHaveLength(putsAfterFail);
  });
});

/** Ordered line-item field keys — pin so column drops/reorders fail loudly (U-486). */
const EXPENSE_LINE_ITEM_FIELD_KEYS = [
  "description",
  "sub_cost_code_id",
  "project_id",
  "quantity",
  "rate",
  "amount",
  "markup",
  "price",
  "is_billable",
] as const;

const EXPENSE_LINE_ITEM_HEADER_LABELS = [
  "Description",
  "Sub Cost Code",
  "Project",
  "Qty",
  "Rate",
  "Amount",
  "Markup",
  "Price",
  "Billable",
] as const;

function lineItemHeaderLabels(container: HTMLElement): string[] {
  const table = container.querySelector(".inline-li-table");
  expect(table).not.toBeNull();
  return Array.from(table!.querySelectorAll("thead th"))
    .map((th) => th.textContent?.trim() ?? "")
    .filter((label) => label !== "" && label !== "Attachment");
}

function firstLineItemRow(container: HTMLElement): HTMLTableRowElement {
  const rows = inlineLineItemRows(container);
  expect(rows.length).toBeGreaterThan(0);
  return rows[0]!;
}

function sccComboboxInRow(row: HTMLTableRowElement): Element {
  const box = row.querySelectorAll("td")[1]?.querySelector(".bo-combobox");
  if (!box) throw new Error("expected sub_cost_code_id combobox in column 2");
  return box;
}

function projectComboboxInRow(row: HTMLTableRowElement): Element {
  const box = row.querySelectorAll("td")[2]?.querySelector(".bo-combobox");
  if (!box) throw new Error("expected project_id combobox in column 3");
  return box;
}

function vendorCombobox(container: HTMLElement): Element {
  const box = container.querySelector('[data-bo-field="vendor_public_id"]');
  if (!box) throw new Error("expected vendor combobox");
  return box;
}

function visibleComboboxOptionLabels(): string[] {
  return Array.from(document.querySelectorAll('[role="listbox"] [role="option"]'))
    .filter((o) => !o.querySelector(".bo-combobox-truncated-hint"))
    .map((o) => o.textContent?.trim() ?? "");
}

function sccCatalogVisible(container: HTMLElement): boolean {
  try {
    const sccBox = sccComboboxInRow(firstLineItemRow(container));
    if (sccBox.hasAttribute("data-bo-combobox-pending")) return false;
    comboboxInput(sccBox).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
    return visibleComboboxOptionLabels().includes("00.02 — Suspense");
  } catch {
    return false;
  }
}

function submitForReviewButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter((b) =>
    b.textContent?.includes("Submit for Review"),
  );
}

describe("ExpenseEdit line-item coding fields (U-486)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    vi.mocked(ReviewTimeline).mockImplementation(() =>
      createElement(
        "div",
        { "data-testid": "review-timeline-stub" },
        createElement("button", { type: "button" }, "Submit for Review"),
      ),
    );

    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) {
        return Promise.resolve(sampleExpense({ is_draft: true }));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    mockGetList.mockImplementation((path: string) => {
      const catalog = codingCatalogGetList(path);
      if (catalog) return Promise.resolve(catalog);
      if (path === SUB_COST_CODES_PATH) {
        return Promise.resolve({
          data: [
            { id: 481, public_id: "scc-481", name: "Suspense", number: "00.02" },
            { id: 99, public_id: "scc-99", name: "NoNumberScc", number: null },
          ],
          count: 2,
        });
      }
      if (path === PROJECTS_PATH) {
        return Promise.resolve({
          data: [{ id: 144, public_id: PROJECT_144_PUBLIC_ID, name: "Main Street" }],
          count: 1,
        });
      }
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return Promise.resolve({
          data: [
            expenseLineItemFixture("li-coded", "Line to code", "50.00"),
          ],
          count: 1,
        });
      }
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });

    mockPut.mockImplementation((path: string) => {
      if (path === EXPENSE_UPDATE_PATH) {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true }));
      }
      if (path.startsWith("/api/v1/update/expense_line_item/")) {
        return Promise.resolve({
          public_id: path.split("/").pop(),
          row_version: "rv-li-upd",
        });
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    mockPost.mockRejectedValue(new Error("unexpected post"));
    mockDel.mockResolvedValue({});

    vi.stubGlobal("confirm", vi.fn(() => true));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.mocked(ReviewTimeline).mockImplementation(() => null);
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function waitForCodingReady() {
    await waitForReady(container);
    await flushUntil(() => inlineLineItemRows(container).length === 1);
    await act(async () => {
      await waitForCombobox(sccComboboxInRow(firstLineItemRow(container)));
    });
    await flushUntilHard(() => sccCatalogVisible(container), "SCC catalog loaded");
  }

  it("renders SubCostCode as a combobox with number — name option labels", async () => {
    renderExpenseEdit(root);
    await waitForCodingReady();

    const sccBox = sccComboboxInRow(firstLineItemRow(container));
    expect(sccBox.classList.contains("bo-combobox--inline")).toBe(true);

    await act(async () => {
      comboboxInput(sccBox).focus();
      comboboxInput(sccBox).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    expect(visibleComboboxOptionLabels()).toContain("00.02 — Suspense");
  });

  it("shows an existing line item project as selected (numeric row value)", async () => {
    mockGetList.mockImplementation((path: string) => {
      const catalog = codingCatalogGetList(path);
      if (catalog) return Promise.resolve(catalog);
      if (path === SUB_COST_CODES_PATH) {
        return Promise.resolve({ data: [], count: 0 });
      }
      if (path === PROJECTS_PATH) {
        return Promise.resolve({
          data: [{ id: 144, public_id: PROJECT_144_PUBLIC_ID, name: "Main Street" }],
          count: 1,
        });
      }
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return Promise.resolve({
          data: [
            expenseLineItemFixture("li-coded", "Line to code", "50.00", { project_id: 144 }),
          ],
          count: 1,
        });
      }
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });

    renderExpenseEdit(root);
    await waitForReady(container);
    await flushUntil(() => inlineLineItemRows(container).length === 1);
    await act(async () => {
      await waitForCombobox(projectComboboxInRow(firstLineItemRow(container)));
    });

    const projectBox = projectComboboxInRow(firstLineItemRow(container));
    expect(getComboboxValue(projectBox)).toBe("144");
    expect(comboboxInput(projectBox).value).toBe("Main Street");
  });

  it("shows project abbreviation in the picker label while keeping internal id as value", async () => {
    mockGetList.mockImplementation((path: string) => {
      const catalog = codingCatalogGetList(path);
      if (catalog) return Promise.resolve(catalog);
      if (path === SUB_COST_CODES_PATH) {
        return Promise.resolve({ data: [], count: 0 });
      }
      if (path === PROJECTS_PATH) {
        return Promise.resolve({
          data: [
            {
              id: 144,
              public_id: PROJECT_144_PUBLIC_ID,
              name: "4406 Harding",
              abbreviation: "HP2",
            },
          ],
          count: 1,
        });
      }
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return Promise.resolve({
          data: [
            expenseLineItemFixture("li-coded", "Line to code", "50.00", { project_id: 144 }),
          ],
          count: 1,
        });
      }
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });

    renderExpenseEdit(root);
    await waitForReady(container);
    await flushUntil(() => inlineLineItemRows(container).length === 1);
    await act(async () => {
      await waitForCombobox(projectComboboxInRow(firstLineItemRow(container)));
    });

    const projectBox = projectComboboxInRow(firstLineItemRow(container));
    expect(getComboboxValue(projectBox)).toBe("144");
    expect(comboboxInput(projectBox).value).toBe("HP2 — 4406 Harding");

    const row = firstLineItemRow(container);
    await act(async () => {
      setInputValue(inlineLineItemInput(row), "Line to code (edited)");
    });
    await clickSave(container);
    const linePuts = putCallsForLineItem("li-coded");
    expect(linePuts.length).toBeGreaterThan(0);
    expect(linePuts[linePuts.length - 1]![1].project_public_id).toBe(PROJECT_144_PUBLIC_ID);
  });

  it("persists numeric sub_cost_code_id and project public_id UUID on save", async () => {
    renderExpenseEdit(root);
    await waitForCodingReady();

    const row = firstLineItemRow(container);
    await act(async () => {
      pickComboboxOptionByValue(sccComboboxInRow(row), "481");
      pickComboboxOptionByValue(projectComboboxInRow(row), "144");
    });

    await clickSave(container);

    const linePuts = putCallsForLineItem("li-coded");
    expect(linePuts.length).toBeGreaterThan(0);
    const body = linePuts[linePuts.length - 1]![1];
    expect(body.sub_cost_code_id).toBe(481);
    expect(typeof body.sub_cost_code_id).toBe("number");
    expect(body.project_public_id).toBe(PROJECT_144_PUBLIC_ID);
    expect(body.project_public_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("sends project_public_id null when projects catalog is not loaded yet", async () => {
    mockGetListWithCodingCatalog((path: string) => {
      if (path === SUB_COST_CODES_PATH) {
        return { data: [{ id: 481, public_id: "scc-481", name: "Suspense", number: "00.02" }], count: 1 };
      }
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return {
          data: [
            expenseLineItemFixture("li-coded", "Line to code", "50.00", { project_id: 144 }),
          ],
          count: 1,
        };
      }
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });

    renderExpenseEdit(root);
    await waitForReady(container);
    await flushUntil(() => inlineLineItemRows(container).length === 1);
    // Projects catalog is still empty — the select has no matching option, but row
    // state carries the numeric id from the line-item GET (save converts at wire time).
    await flushUntil(() =>
      mockGetList.mock.calls.some((c) => c[0] === "/api/v1/get/expense_line_items/expense/1"),
    );

    await act(async () => {
      setInputValue(
        inlineLineItemInput(inlineLineItemRows(container)[0]!),
        "Line to code (edited)",
      );
    });

    await clickSave(container);

    const linePuts = putCallsForLineItem("li-coded");
    expect(linePuts.length).toBeGreaterThan(0);
    const body = linePuts[linePuts.length - 1]![1];
    expect(body.project_public_id).toBeNull();
  });

  it("labels a SubCostCode without number using its name only", async () => {
    renderExpenseEdit(root);
    await waitForCodingReady();

    const sccBox = sccComboboxInRow(firstLineItemRow(container));
    await act(async () => {
      comboboxInput(sccBox).focus();
      comboboxInput(sccBox).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    const labels = visibleComboboxOptionLabels();
    expect(labels).toContain("NoNumberScc");
    expect(labels.some((l) => l.includes(" — NoNumberScc"))).toBe(false);
  });

  it("keeps the full ordered line-item field key list via column headers", async () => {
    renderExpenseEdit(root);
    await waitForCodingReady();

    expect(EXPENSE_LINE_ITEM_FIELD_KEYS.length).toBe(9);
    expect(lineItemHeaderLabels(container)).toEqual([...EXPENSE_LINE_ITEM_HEADER_LABELS]);
  });

  it("does not add a second Submit for Review control beyond ReviewTimeline", async () => {
    renderExpenseEdit(root);
    await waitForReady(container);

    expect(submitForReviewButtons(container)).toHaveLength(1);
    expect(container.querySelector('[data-testid="review-timeline-stub"]')).not.toBeNull();
  });
});

function deleteButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Delete" || b.textContent?.trim() === "Deleting...",
  );
}

describe("ExpenseEdit U-487 bill parity", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockCurrentUserData = {
      is_admin: true,
      modules: [],
      auth: { public_id: "a", username: "admin" },
      user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
      role: null,
      accessible_project_ids: [],
    };

    vi.mocked(ReviewTimeline).mockImplementation((props: { onBeforeAction?: () => Promise<boolean> }) =>
      createElement(
        "button",
        {
          type: "button",
          "data-testid": "review-submit-stub",
          onClick: async () => {
            if (props.onBeforeAction) {
              const ok = await props.onBeforeAction();
              if (!ok) return;
            }
            await mockPost(REVIEW_SUBMIT_PATH, { comments: null });
          },
        },
        "Submit for Review",
      ),
    );

    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) {
        return Promise.resolve(sampleExpense({ is_draft: true, vendor_id: 1 }));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    mockGetListWithCodingCatalog((path: string) => {
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return {
          data: [expenseLineItemFixture("li-coded", "Line to code", "50.00")],
          count: 1,
        };
      }
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });

    mockPut.mockImplementation((path: string) => {
      if (path === EXPENSE_UPDATE_PATH) {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true, vendor_id: 1 }));
      }
      if (path.startsWith("/api/v1/update/expense_line_item/")) {
        return Promise.resolve({
          public_id: path.split("/").pop(),
          row_version: "rv-li-upd",
        });
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    mockPost.mockImplementation((path: string) => {
      if (path === REVIEW_SUBMIT_PATH) return Promise.resolve({});
      return Promise.reject(new Error("unexpected post: " + path));
    });
    mockDel.mockResolvedValue({});

    vi.stubGlobal("confirm", vi.fn(() => true));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.mocked(ReviewTimeline).mockImplementation(() => null);
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function waitForExpenseForm() {
    await waitForCondition(() => findSaveButton(container) !== undefined);
    await flushUntil(() => inlineLineItemRows(container).length === 1);
  }

  it("Submit for Review flushes pending line edits via saveAll before POSTing review", async () => {
    mockGetList.mockImplementation((path: string) => {
      const catalog = codingCatalogGetList(path);
      if (catalog) return Promise.resolve(catalog);
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return Promise.resolve({
          data: [
            expenseLineItemFixture("li-coded", "Line to code", "50.00", { sub_cost_code_id: null }),
          ],
          count: 1,
        });
      }
      if (path === SUB_COST_CODES_PATH) {
        return Promise.resolve({
          data: [{ id: 481, public_id: "scc-481", name: "Suspense", number: "00.02" }],
          count: 1,
        });
      }
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });

    renderExpenseEdit(root);
    await waitForExpenseForm();
    await act(async () => {
      await waitForCombobox(sccComboboxInRow(firstLineItemRow(container)));
    });
    await flushUntilHard(() => sccCatalogVisible(container), "SCC catalog loaded");

    await act(async () => {
      pickComboboxOptionByValue(sccComboboxInRow(firstLineItemRow(container)), "481");
    });
    await flushUntil(
      () => getComboboxValue(sccComboboxInRow(firstLineItemRow(container))) === "481",
    );

    const reviewPostsBefore = mockPost.mock.calls.filter((c) => c[0] === REVIEW_SUBMIT_PATH).length;
    expect(reviewPostsBefore).toBe(0);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-submit-stub"]')!.click();
    });
    await flushUntil(() =>
      mockPost.mock.calls.some((c) => c[0] === REVIEW_SUBMIT_PATH),
    );

    const linePutIdx = mockPut.mock.calls.findIndex(
      (c) => c[0] === "/api/v1/update/expense_line_item/li-coded",
    );
    const reviewIdx = mockPost.mock.calls.findIndex((c) => c[0] === REVIEW_SUBMIT_PATH);
    expect(linePutIdx).toBeGreaterThanOrEqual(0);
    expect(reviewIdx).toBeGreaterThanOrEqual(0);
    const linePutOrder = mockPut.mock.invocationCallOrder[linePutIdx]!;
    const reviewOrder = mockPost.mock.invocationCallOrder[reviewIdx]!;
    expect(linePutOrder).toBeLessThan(reviewOrder);
    const lineBody = mockPut.mock.calls[linePutIdx]![1] as Record<string, unknown>;
    expect(lineBody.sub_cost_code_id).toBe(481);
  });

  it("aborts Submit for Review when saveAll returns false", async () => {
    mockPut.mockImplementation((path: string) => {
      if (path === EXPENSE_UPDATE_PATH) {
        return Promise.reject(new Error("save failed"));
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    renderExpenseEdit(root);
    await waitForExpenseForm();

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    await act(async () => { setTextareaValue(memo, "unsaved edit"); });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-submit-stub"]')!.click();
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === EXPENSE_UPDATE_PATH));
    await flushMicrotasks();

    expect(mockPost.mock.calls.some((c) => c[0] === REVIEW_SUBMIT_PATH)).toBe(false);
  });

  it("Submit for Review on an untouched draft issues ZERO PUTs before the review POST", async () => {
    renderExpenseEdit(root);
    await waitForExpenseForm();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-submit-stub"]')!.click();
    });
    await flushUntilHard(
      () => mockPost.mock.calls.some((c) => c[0] === REVIEW_SUBMIT_PATH),
      "review submit POST",
    );

    expect(mockPut.mock.calls).toHaveLength(0);
    expect(mockPost.mock.calls.filter((c) => c[0] === REVIEW_SUBMIT_PATH)).toHaveLength(1);
  });

  it("renders a stored vendor_id as the selected vendor_public_id", async () => {
    renderExpenseEdit(root);
    await waitForExpenseForm();

    expect(getComboboxValue(vendorCombobox(container))).toBe(VENDOR_1_PUBLIC_ID);
  });

  it("tabbing through vendor and line pickers without edits sends no PUT on Save (U-621b)", async () => {
    mockGetList.mockImplementation((path: string) => {
      const catalog = codingCatalogGetList(path);
      if (catalog) return Promise.resolve(catalog);
      if (path === SUB_COST_CODES_PATH) {
        return Promise.resolve({
          data: [{ id: 481, public_id: "scc-481", name: "Suspense", number: "00.02" }],
          count: 1,
        });
      }
      if (path === PROJECTS_PATH) {
        return Promise.resolve({
          data: [{ id: 144, public_id: PROJECT_144_PUBLIC_ID, name: "Main Street", abbreviation: "HP2" }],
          count: 1,
        });
      }
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return Promise.resolve({
          data: [
            expenseLineItemFixture("li-coded", "Line to code", "50.00", {
              sub_cost_code_id: 481,
              project_id: 144,
            }),
          ],
          count: 1,
        });
      }
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });

    renderExpenseEdit(root);
    await waitForExpenseForm();
    await flushUntilHard(
      () => getComboboxValue(vendorCombobox(container)) === VENDOR_1_PUBLIC_ID,
      "vendor value hydrated",
    );
    await act(async () => {
      await waitForCombobox(vendorCombobox(container));
    });
    await flushUntilHard(
      () => comboboxInput(vendorCombobox(container)).value.length > 0,
      "vendor label visible",
    );

    const row = firstLineItemRow(container);
    await act(async () => {
      await waitForCombobox(sccComboboxInRow(row));
      await waitForCombobox(projectComboboxInRow(row));
    });
    await flushUntilHard(
      () => comboboxInput(sccComboboxInRow(row)).value === "00.02 — Suspense",
      "SCC label visible",
    );
    await flushUntilHard(
      () => comboboxInput(projectComboboxInRow(row)).value === "HP2 — Main Street",
      "project label visible",
    );

    await act(async () => {
      tabAwayFromCombobox(vendorCombobox(container));
      tabAwayFromCombobox(sccComboboxInRow(row));
      tabAwayFromCombobox(projectComboboxInRow(row));
    });

    await clickSave(container);
    expect(mockPut.mock.calls).toHaveLength(0);
  });

  it("does not claim Complete syncs to QBO", async () => {
    renderExpenseEdit(root);
    await waitForExpenseForm();

    expect(container.textContent).not.toMatch(/\bQBO\b/);
    expect(container.textContent).toMatch(/SharePoint/i);
    expect(container.textContent).toMatch(/Excel/i);
  });

  it("shows Delete only when canDelete and cancels auto-save before DELETE", async () => {
    const { Modules } = await import("../../shared/modules");

    mockCurrentUserData = {
      is_admin: false,
      modules: [
        {
          public_id: "mod-exp",
          name: Modules.EXPENSES,
          route: null,
          can_create: false,
          can_read: true,
          can_update: true,
          can_delete: true,
          can_submit: false,
          can_approve: false,
          can_complete: true,
          can_view_team: false,
        },
      ],
      auth: { public_id: "a", username: "user" },
      user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
      role: null,
      accessible_project_ids: [],
    };

    renderExpenseEdit(root);
    await waitForExpenseForm();

    expect(deleteButton(container)).toBeDefined();

    mockCurrentUserData = {
      ...mockCurrentUserData,
      modules: [
        {
          ...mockCurrentUserData.modules[0]!,
          can_delete: false,
        },
      ],
    };

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    renderExpenseEdit(root);
    await waitForExpenseForm();

    expect(deleteButton(container)).toBeUndefined();

    mockCurrentUserData = {
      ...mockCurrentUserData,
      modules: [
        {
          ...mockCurrentUserData.modules[0]!,
          can_delete: true,
        },
      ],
    };
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    renderExpenseEdit(root);
    await waitForExpenseForm();

    await act(async () => {
      deleteButton(container)!.click();
    });
    await flushUntil(() =>
      mockDel.mock.calls.some((c) => c[0] === EXPENSE_DELETE_PATH),
    );
    expect(mockDel).toHaveBeenCalledWith(EXPENSE_DELETE_PATH);
  });

  it("passes onBeforeAction to ReviewTimeline so submit can flush", async () => {
    renderExpenseEdit(root);
    await waitForExpenseForm();

    expect(ReviewTimeline).toHaveBeenCalled();
    const lastProps = vi.mocked(ReviewTimeline).mock.calls.at(-1)![0];
    expect(typeof lastProps.onBeforeAction).toBe("function");
  });
});

describe("ExpenseEdit delete document (U-683a)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    expenseDeleteDocumentAutoSaveStub = true;
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    mockCurrentUserData = {
      is_admin: false,
      modules: [
        {
          public_id: "mod-exp",
          name: "Expenses",
          route: null,
          can_create: false,
          can_read: true,
          can_update: true,
          can_delete: true,
          can_submit: false,
          can_approve: false,
          can_complete: true,
          can_view_team: false,
        },
      ],
      auth: { public_id: "a", username: "user" },
      user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
      role: null,
      accessible_project_ids: [],
    };

    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) return Promise.resolve(sampleExpense({ is_draft: true }));
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    mockGetListWithCodingCatalog((path: string) => {
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return {
          data: [expenseLineItemFixture("li-coded", "Line to code", "50.00")],
          count: 1,
        };
      }
      if (path === SUB_COST_CODES_PATH || path === PROJECTS_PATH) {
        return { data: [], count: 0 };
      }
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });

    mockPut.mockImplementation((path: string) => {
      if (path === EXPENSE_UPDATE_PATH) {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true, vendor_id: 1 }));
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    mockDel.mockImplementation((path: string) => {
      if (path === EXPENSE_DELETE_PATH) {
        expect(mockCancelAutoSaveForDelete).toHaveBeenCalled();
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error(`unexpected del: ${path}`));
    });

    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(entityItemKey(EXPENSE_GET_PATH), sampleExpense());

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/expense/exp-1/edit"] },
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: "/expense/:publicId/edit",
                element: createElement(ExpenseEdit),
              }),
            ),
          ),
        ),
      );
    });
  });

  afterEach(() => {
    expenseDeleteDocumentAutoSaveStub = false;
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function waitForExpenseForm() {
    await waitForCondition(() => findSaveButton(container) !== undefined);
    await flushUntil(() => inlineLineItemRows(container).length === 1);
  }

  it("confirm → cancelAutoSave → DELETE → cache removed → toast → navigate", async () => {
    await waitForExpenseForm();

    const callOrder: string[] = [];
    mockCancelAutoSaveForDelete.mockImplementation(() => {
      callOrder.push("cancel");
    });
    mockDel.mockImplementation((path: string) => {
      if (path === EXPENSE_DELETE_PATH) {
        callOrder.push("delete");
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error(`unexpected del: ${path}`));
    });

    await act(async () => {
      deleteButton(container)!.click();
    });

    await flushUntil(() => mockNavigate.mock.calls.some((c) => String(c[0]).startsWith("/expense/list")));
    expect(callOrder).toEqual(["cancel", "delete"]);
    expect(mockDel).toHaveBeenCalledWith(EXPENSE_DELETE_PATH);
    expect(queryClient.getQueryData(entityItemKey(EXPENSE_GET_PATH))).toBeUndefined();
    expect(mockToast).toHaveBeenCalledWith("Expense deleted.");
    expect(mockNavigate).toHaveBeenCalledWith("/expense/list?status=draft");
  });
});

describe("ExpenseEdit Billable decision on a NEW line (U-647, Codex P1)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) return Promise.resolve(sampleExpense({ is_draft: true }));
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });
    mockGetListResolvedForAll({ data: [], count: 0 });
    mockPost.mockImplementation((path: string) => {
      if (path === "/api/v1/create/expense_line_item") {
        return Promise.resolve({ public_id: "li-new", row_version: "rv-created" });
      }
      return Promise.reject(new Error("unexpected post: " + path));
    });
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/expense/exp-1") {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true }));
      }
      if (path.startsWith("/api/v1/update/expense_line_item/")) {
        return Promise.resolve({ public_id: path.split("/").pop(), row_version: "rv-stamped" });
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  const button = (label: string) =>
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === label) as
      | HTMLButtonElement
      | undefined;

  it("stamps a person's toggle on a new line through the update route right after the create", async () => {
    renderExpenseEdit(root);
    await waitForCondition(() => button("+ Add Row") !== undefined);
    await act(async () => {
      button("+ Add Row")!.click();
      await flushMicrotasks();
    });
    // The line grid's checkbox, not the header's is_credit checkbox.
    const box = container.querySelector('td input[type="checkbox"]') as HTMLInputElement | null;
    expect(box).not.toBeNull();
    await act(async () => {
      box!.click(); // a person unticks the default
      await flushMicrotasks();
    });
    await act(async () => {
      button("Save")!.click();
      await flushMicrotasks();
    });

    expect(mockPost).toHaveBeenCalledWith("/api/v1/create/expense_line_item", expect.anything());
    const stampCall = mockPut.mock.calls.find(([p]) => p === "/api/v1/update/expense_line_item/li-new");
    expect(stampCall).toBeDefined();
    expect(stampCall![1]).toMatchObject({ billable_decided: true, is_billable: false, row_version: "rv-created" });
  });

  it("a second save while the first is writing joins it instead of sending a duplicate update", async () => {
    let releaseStamp!: () => void;
    const stampGate = new Promise<void>((r) => (releaseStamp = r));
    mockPut.mockImplementation(async (path: string) => {
      if (path === "/api/v1/update/expense/exp-1") return sampleExpense({ row_version: "rv-2", is_draft: true });
      if (path === "/api/v1/update/expense_line_item/li-new") { await stampGate; return { public_id: "li-new", row_version: "rv-stamped" }; }
      throw new Error("unexpected put: " + path);
    });
    renderExpenseEdit(root);
    await waitForCondition(() => button("+ Add Row") !== undefined);
    await act(async () => { button("+ Add Row")!.click(); await flushMicrotasks(); });
    const box = container.querySelector('td input[type="checkbox"]') as HTMLInputElement;
    await act(async () => { box.click(); await flushMicrotasks(); });
    await act(async () => { button("Save")!.click(); await flushMicrotasks(); });   // first save parks on the stamp PUT
    // A second save while the first is writing — the review timeline's submit action
    // calls saveAll the same way; the form submit reaches it here (the Save button is
    // disabled while saving, which is not a guard for the other callers).
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await flushMicrotasks(); });
    // Nothing on screen can change under the in-flight save, so a caller that joins it
    // gets a result that covers everything shown (round 3).
    // :disabled, not .disabled — the IDL property ignores an ancestor <fieldset disabled>.
    expect((container.querySelector('td input[type="checkbox"]') as HTMLInputElement).matches(":disabled")).toBe(true);
    await act(async () => { releaseStamp(); await flushMicrotasks(); });
    expect((container.querySelector('td input[type="checkbox"]') as HTMLInputElement).matches(":disabled")).toBe(false);
    expect(mockPost.mock.calls.filter(([p]) => p === "/api/v1/create/expense_line_item")).toHaveLength(1);
    expect(mockPut.mock.calls.filter(([p]) => p === "/api/v1/update/expense_line_item/li-new")).toHaveLength(1);
  });

  it("does not issue a stamping update for an untouched new line", async () => {
    renderExpenseEdit(root);
    await waitForCondition(() => button("+ Add Row") !== undefined);
    await act(async () => {
      button("+ Add Row")!.click();
      await flushMicrotasks();
    });
    await act(async () => {
      button("Save")!.click();
      await flushMicrotasks();
    });
    expect(mockPost).toHaveBeenCalled();
    expect(mockPut.mock.calls.some(([p]) => p === "/api/v1/update/expense_line_item/li-new")).toBe(false);
  });
});


describe("ExpenseEdit Billable default when projects arrive mid-load (U-647, Codex P2)", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it("shows the cost-plus default for an undecided line whose projects landed while lines were loading", async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetOne.mockImplementation((path: string) => {
      const elia404 = elia404IfMatch(path);
      if (elia404) return elia404;
      if (path === EXPENSE_GET_PATH) return Promise.resolve(sampleExpense({ is_draft: true }));
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });
    let releaseProjects!: () => void;
    let releaseLines!: () => void;
    const projectsGate = new Promise<void>((r) => (releaseProjects = r));
    const linesGate = new Promise<void>((r) => (releaseLines = r));
    mockGetList.mockImplementation(async (path: string) => {
      if (path === "/api/v1/get/projects") {
        await projectsGate;
        return { data: [{ id: 7, public_id: "p-7", name: "Cost-plus job", is_cost_plus: true }], count: 1 };
      }
      if (path.startsWith("/api/v1/get/expense_line_items/expense/")) {
        await linesGate;
        return {
          data: [{
            public_id: "li-a", row_version: "rv-li-a", description: "Ramp line", sub_cost_code_id: null,
            project_id: 7, quantity: null, rate: null, amount: "10", is_billable: false,
            markup: null, price: null, billable_decided_at: null,
          }],
          count: 1,
        };
      }
      const catalog = codingCatalogGetList(path);
      if (catalog) return catalog;
      return { data: [], count: 0 };
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const settle = async () => {
      for (let i = 0; i < 20; i++) {
        await act(async () => { await vi.advanceTimersByTimeAsync(0); await Promise.resolve(); });
      }
    };
    renderExpenseEdit(root);
    await settle();                                               // expense loads; the line fetch starts and waits
    expect(mockGetList.mock.calls.some(([p]) => String(p).startsWith("/api/v1/get/expense_line_items/expense/"))).toBe(true);
    releaseProjects(); await settle();                            // projects land FIRST (rows still empty)
    expect(container.textContent).not.toContain("Ramp line");
    releaseLines(); await settle();                               // then the lines
    await waitForCondition(() => container.querySelector('td input[type="checkbox"]') !== null);

    const box = container.querySelector('td input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(true);   // the project default, not the Ramp NotBillable mirror
  });
});

function emptyCodingLineMocks(
  suggestResponse: unknown,
  expenseOverrides: Partial<Expense> = {},
) {
  mockGetOne.mockImplementation((path: string) => {
    const elia404 = elia404IfMatch(path);
    if (elia404) return elia404;
    if (path === EXPENSE_GET_PATH) {
      return Promise.resolve(sampleExpense({ is_draft: true, vendor_id: 1, ...expenseOverrides }));
    }
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  mockGetList.mockImplementation((path: string) => {
    const catalog = codingCatalogGetList(path);
    if (catalog) return Promise.resolve(catalog);
    if (path === SUB_COST_CODES_PATH) {
      return Promise.resolve({
        data: [{ id: 21, public_id: "scc-21", name: "Siding Material", number: "21.00" }],
        count: 1,
      });
    }
    if (path === PROJECTS_PATH) {
      return Promise.resolve({
        data: [
          {
            id: 144,
            public_id: PROJECT_144_PUBLIC_ID,
            name: "Main Street",
            abbreviation: "HP2",
          },
        ],
        count: 1,
      });
    }
    if (path === "/api/v1/get/expense_line_items/expense/1") {
      return Promise.resolve({
        data: [
          expenseLineItemFixture("li-empty", "Uncoded line", "50.00", {
            sub_cost_code_id: null,
            project_id: null,
          }),
        ],
        count: 1,
      });
    }
    return Promise.reject(new Error(`unexpected getList: ${path}`));
  });

  mockPost.mockImplementation((path: string) => {
    if (path === EXPENSE_CODING_SUGGEST_PATH) {
      return Promise.resolve(suggestResponse);
    }
    if (path === REVIEW_SUBMIT_PATH) return Promise.resolve({});
    return Promise.reject(new Error(`unexpected post: ${path}`));
  });
}

describe("ExpenseEdit coding suggestions (U-715)", () => {
  let container: HTMLDivElement;
  let root: Root;

  const defaultMockCurrentUser = {
    is_admin: true,
    modules: [] as import("../../types/api").CurrentUserModule[],
    auth: { public_id: "a", username: "admin" },
    user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
    role: null as null,
    accessible_project_ids: [] as number[],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockCurrentUserData = { ...defaultMockCurrentUser, modules: [...defaultMockCurrentUser.modules] };

    vi.mocked(ReviewTimeline).mockImplementation((props: { onBeforeAction?: () => Promise<boolean> }) =>
      createElement(
        "button",
        {
          type: "button",
          "data-testid": "review-submit-stub",
          onClick: async () => {
            if (props.onBeforeAction) {
              const ok = await props.onBeforeAction();
              if (!ok) return;
            }
            await mockPost(REVIEW_SUBMIT_PATH, { comments: null });
          },
        },
        "Submit for Review",
      ),
    );

    mockPut.mockImplementation((path: string) => {
      if (path === EXPENSE_UPDATE_PATH) {
        return Promise.resolve(sampleExpense({ row_version: "rv-2", is_draft: true, vendor_id: 1 }));
      }
      if (path.startsWith("/api/v1/update/expense_line_item/")) {
        return Promise.resolve({
          public_id: path.split("/").pop(),
          row_version: "rv-li-upd",
        });
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });
    mockDel.mockResolvedValue({});

    vi.stubGlobal("confirm", vi.fn(() => true));

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    mockCurrentUserData = { ...defaultMockCurrentUser, modules: [...defaultMockCurrentUser.modules] };
    vi.mocked(ReviewTimeline).mockImplementation(() => null);
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function waitForCodingSuggestUi() {
    await waitForCondition(() => findSaveButton(container) !== undefined);
    await flushUntilHard(() => inlineLineItemRows(container).length === 1, "one line row");
    await act(async () => {
      await waitForCombobox(sccComboboxInRow(firstLineItemRow(container)));
    });
  }

  it("memo_shorthand SCC shows a prominent chip; Accept fills SCC and Save PUT carries sub_cost_code_id", async () => {
    emptyCodingLineMocks({
      status: "suggested",
      sub_cost_code: {
        id: 21,
        source: "memo_shorthand",
        confidence: 0.9,
        reason: "Memo shorthand",
      },
      project: null,
      confidence: 0.9,
    });

    renderExpenseEdit(root);
    await waitForCodingSuggestUi();

    await flushUntilHard(
      () => container.querySelector(".status-badge.coding-suggested") !== null,
      "memo SCC suggestion chip",
    );
    expect(container.querySelector(".expense-coding-vendor-hint")).toBeNull();

    const acceptBtn = container.querySelector(
      'button[aria-label="Accept suggested sub cost code 21.00 — Siding Material"]',
    ) as HTMLButtonElement;
    expect(acceptBtn).not.toBeNull();

    await act(async () => {
      acceptBtn.click();
    });
    await flushUntilHard(
      () => getComboboxValue(sccComboboxInRow(firstLineItemRow(container))) === "21",
      "SCC combobox filled",
    );
    expect(container.querySelector(".status-badge.coding-suggested")).toBeNull();

    await clickSave(container);
    const linePut = mockPut.mock.calls.find(
      (c) => c[0] === "/api/v1/update/expense_line_item/li-empty",
    );
    expect(linePut).toBeDefined();
    expect((linePut![1] as Record<string, unknown>).sub_cost_code_id).toBe(21);
  });

  it("vendor_history SCC shows low-key vendor hint styling; Accept fills SCC the same way", async () => {
    emptyCodingLineMocks({
      status: "suggested",
      sub_cost_code: {
        id: 21,
        source: "vendor_history",
        confidence: 0.72,
        reason: "Vendor pattern",
      },
      project: null,
      confidence: 0.72,
    });

    renderExpenseEdit(root);
    await waitForCodingSuggestUi();

    await flushUntilHard(
      () => container.querySelector(".expense-coding-vendor-hint") !== null,
      "vendor hint visible",
    );
    expect(container.textContent).toContain("Vendor usually 21.00 — Siding Material");
    expect(container.querySelector(".status-badge.coding-suggested")).toBeNull();

    const acceptBtn = container.querySelector(
      'button[aria-label="Accept suggested sub cost code 21.00 — Siding Material"]',
    ) as HTMLButtonElement;
    await act(async () => {
      acceptBtn.click();
    });
    await flushUntilHard(
      () => getComboboxValue(sccComboboxInRow(firstLineItemRow(container))) === "21",
      "vendor-history accept fills SCC",
    );
  });

  it("memo_code project suggestion on empty Project; Accept fills internal id; Save sends project_public_id", async () => {
    emptyCodingLineMocks({
      status: "suggested",
      sub_cost_code: null,
      project: {
        id: 144,
        source: "memo_code",
        confidence: 0.88,
        reason: "HP2 in memo",
      },
      confidence: 0.88,
    });

    renderExpenseEdit(root);
    await waitForCodingSuggestUi();

    await flushUntilHard(
      () =>
        container.querySelector(
          'button[aria-label="Accept suggested project HP2 — Main Street"]',
        ) !== null,
      "project suggestion accept control",
    );

    const acceptBtn = container.querySelector(
      'button[aria-label="Accept suggested project HP2 — Main Street"]',
    ) as HTMLButtonElement;
    await act(async () => {
      acceptBtn.click();
    });
    await flushUntilHard(
      () => getComboboxValue(projectComboboxInRow(firstLineItemRow(container))) === "144",
      "project combobox filled with internal id",
    );

    await clickSave(container);
    const linePut = mockPut.mock.calls.find(
      (c) => c[0] === "/api/v1/update/expense_line_item/li-empty",
    );
    expect((linePut![1] as Record<string, unknown>).project_public_id).toBe(PROJECT_144_PUBLIC_ID);
  });

  it("does not show a chip when the field is already filled", async () => {
    emptyCodingLineMocks({
      status: "suggested",
      sub_cost_code: {
        id: 21,
        source: "memo_shorthand",
        confidence: 0.9,
        reason: "Memo shorthand",
      },
      project: null,
      confidence: 0.9,
    });

    mockGetList.mockImplementation((path: string) => {
      const catalog = codingCatalogGetList(path);
      if (catalog) return Promise.resolve(catalog);
      if (path === SUB_COST_CODES_PATH) {
        return Promise.resolve({
          data: [{ id: 21, public_id: "scc-21", name: "Siding Material", number: "21.00" }],
          count: 1,
        });
      }
      if (path === PROJECTS_PATH) {
        return Promise.resolve({ data: [], count: 0 });
      }
      if (path === "/api/v1/get/expense_line_items/expense/1") {
        return Promise.resolve({
          data: [
            expenseLineItemFixture("li-coded", "Already coded", "50.00", {
              sub_cost_code_id: 21,
              project_id: null,
            }),
          ],
          count: 1,
        });
      }
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });

    renderExpenseEdit(root);
    await waitForCodingSuggestUi();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(mockPost.mock.calls.some((c) => c[0] === EXPENSE_CODING_SUGGEST_PATH)).toBe(true);
    expect(container.querySelector('button[aria-label^="Accept suggested sub cost code"]')).toBeNull();
  });

  it("does not call the suggest endpoint for non-draft expenses", async () => {
    emptyCodingLineMocks(
      {
        status: "not_draft",
        sub_cost_code: null,
        project: null,
        confidence: null,
      },
      { is_draft: false },
    );

    renderExpenseEdit(root);
    await flushUntilHard(
      () => inlineLineItemRows(container).length === 1,
      "expense edit form with line items",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(mockPost.mock.calls.some((c) => c[0] === EXPENSE_CODING_SUGGEST_PATH)).toBe(false);
  });

  it("survives suggest endpoint failure with no chip and a working form", async () => {
    emptyCodingLineMocks({});
    let releaseSuggest!: () => void;
    const suggestGate = new Promise<void>((r) => {
      releaseSuggest = r;
    });
    let suggestProcessed!: () => void;
    const suggestSettled = new Promise<void>((r) => {
      suggestProcessed = r;
    });
    mockPost.mockImplementation(async (path: string) => {
      if (path === EXPENSE_CODING_SUGGEST_PATH) {
        await suggestGate;
        suggestProcessed();
        return Promise.reject(new Error("suggest failed"));
      }
      if (path === REVIEW_SUBMIT_PATH) return Promise.resolve({});
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderExpenseEdit(root);
    await waitForCodingSuggestUi();
    await flushUntilHard(
      () => mockPost.mock.calls.some((c) => c[0] === EXPENSE_CODING_SUGGEST_PATH),
      "suggest POST attempted",
    );
    releaseSuggest();
    await act(async () => {
      await suggestSettled;
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushUntilHard(
      () =>
        errSpy.mock.calls.some((c) =>
          String(c[0]).includes("Expense coding suggest failed"),
        ),
      "suggest failure handled after POST settled",
    );
    expect(container.querySelector('button[aria-label^="Accept"]')).toBeNull();
    expect(findSaveButton(container).disabled).toBe(false);
    errSpy.mockRestore();
  });

  it("hides suggestions when the suggested id is not in the user's catalog", async () => {
    const suggestBody = {
      status: "suggested",
      sub_cost_code: {
        id: 21,
        source: "memo_shorthand",
        confidence: 0.95,
        reason: "Visible SCC",
      },
      project: {
        id: 8888,
        source: "memo_code",
        confidence: 0.95,
        reason: "Hidden project",
      },
      confidence: 0.95,
    };
    emptyCodingLineMocks(suggestBody);
    let releaseSuggest!: () => void;
    const suggestGate = new Promise<void>((r) => {
      releaseSuggest = r;
    });
    let suggestProcessed!: () => void;
    const suggestSettled = new Promise<void>((r) => {
      suggestProcessed = r;
    });
    mockPost.mockImplementation(async (path: string) => {
      if (path === EXPENSE_CODING_SUGGEST_PATH) {
        await suggestGate;
        suggestProcessed();
        return suggestBody;
      }
      if (path === REVIEW_SUBMIT_PATH) return Promise.resolve({});
      return Promise.reject(new Error(`unexpected post: ${path}`));
    });

    renderExpenseEdit(root);
    await waitForCodingSuggestUi();
    await flushUntilHard(
      () => mockPost.mock.calls.some((c) => c[0] === EXPENSE_CODING_SUGGEST_PATH),
      "suggest POST in flight",
    );
    releaseSuggest();
    await act(async () => {
      await suggestSettled;
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushUntilHard(
      () =>
        container.querySelector(
          'button[aria-label="Accept suggested sub cost code 21.00 — Siding Material"]',
        ) !== null,
      "in-catalog SCC suggestion rendered after response",
    );
    expect(container.querySelector('button[aria-label^="Accept suggested project"]')).toBeNull();
  });

  it("does not call coding suggest when the user cannot edit", async () => {
    const { Modules } = await import("../../shared/modules");
    mockCurrentUserData = {
      is_admin: false,
      modules: [
        {
          public_id: "mod-exp",
          name: Modules.EXPENSES,
          route: null,
          can_create: false,
          can_read: true,
          can_update: false,
          can_delete: false,
          can_submit: false,
          can_approve: false,
          can_complete: false,
          can_view_team: false,
        },
      ],
      auth: { public_id: "a", username: "reader" },
      user: { id: 2, public_id: "u2", firstname: "R", lastname: "O" },
      role: null,
      accessible_project_ids: [],
    };

    emptyCodingLineMocks({
      status: "suggested",
      sub_cost_code: {
        id: 21,
        source: "memo_shorthand",
        confidence: 0.9,
        reason: "Memo shorthand",
      },
      project: null,
      confidence: 0.9,
    });

    renderExpenseEdit(root);
    await flushUntilHard(
      () =>
        container.textContent?.includes("You don't have permission to edit this expense.") ??
        false,
      "read-only permission page rendered",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockPost.mock.calls.some((c) => c[0] === EXPENSE_CODING_SUGGEST_PATH)).toBe(false);
  });

  it("merely loading and showing suggestions sends no PUT on Submit for Review (U-621b)", async () => {
    emptyCodingLineMocks({
      status: "suggested",
      sub_cost_code: {
        id: 21,
        source: "memo_shorthand",
        confidence: 0.9,
        reason: "Memo shorthand",
      },
      project: null,
      confidence: 0.9,
    });

    renderExpenseEdit(root);
    await waitForCodingSuggestUi();
    await flushUntilHard(
      () => container.querySelector(".status-badge.coding-suggested") !== null,
      "suggestion visible before submit",
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="review-submit-stub"]')!.click();
    });
    await flushUntilHard(
      () => mockPost.mock.calls.some((c) => c[0] === REVIEW_SUBMIT_PATH),
      "review submit POST",
    );

    expect(mockPut.mock.calls).toHaveLength(0);
  });

  describe("budget chip on SCC suggestion (U-719b)", () => {
    it("shows Within budget beside memo_shorthand SCC when budget fits", async () => {
      emptyCodingLineMocks({
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: null,
        confidence: 0.9,
        budget: { check: "fits", remaining: "500.00", ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".coding-budget-fits") !== null,
        "budget fits chip",
      );
      expect(container.textContent).toContain("Within budget");
    });

    it("formats tight remaining as USD beside the suggestion chip", async () => {
      emptyCodingLineMocks({
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: null,
        confidence: 0.9,
        budget: { check: "tight", remaining: "1234.56", ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".coding-budget-tight") !== null,
        "budget tight chip",
      );
      expect(container.textContent).toContain("Tight: $1,234.56 left");
    });

    it("shows no budget chip when check is no_budget", async () => {
      emptyCodingLineMocks({
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: null,
        confidence: 0.9,
        budget: {
          check: "no_budget",
          remaining: null,
          project_id: null,
        },
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".status-badge.coding-suggested") !== null,
        "SCC suggestion visible",
      );
      expect(container.querySelector("[class*='coding-budget-']")).toBeNull();
    });

    it("shows Over by with positive USD and no minus sign when budget is over", async () => {
      emptyCodingLineMocks({
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: null,
        confidence: 0.9,
        budget: { check: "over", remaining: "-50.00", ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".coding-budget-over") !== null,
        "budget over chip",
      );
      expect(container.textContent).toContain("Over by $50.00");
      expect(container.textContent).not.toMatch(/Over by\s-\$/);
    });

    it("shows No budget line when check is unbudgeted", async () => {
      emptyCodingLineMocks({
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: null,
        confidence: 0.9,
        budget: { check: "unbudgeted", remaining: null, ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".coding-budget-none") !== null,
        "unbudgeted chip",
      );
      expect(container.textContent).toContain("No budget line");
    });

    it("shows budget beside vendor_history SCC the same as memo_shorthand", async () => {
      emptyCodingLineMocks({
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "vendor_history",
          confidence: 0.72,
          reason: "Vendor pattern",
        },
        project: null,
        confidence: 0.72,
        budget: { check: "fits", remaining: "200.00", ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".expense-coding-vendor-hint") !== null,
        "vendor hint",
      );
      expect(container.querySelector(".coding-budget-fits")).not.toBeNull();
      expect(container.textContent).toContain("Within budget");
      expect(container.querySelector(".expense-coding-vendor-hint")?.className).toContain(
        "coding-suggestion-actions",
      );
    });

    it("hides budget chip on a line whose project differs from budget.project_id", async () => {
      emptyCodingLineMocks({
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: { id: 144, source: "memo_code", confidence: 0.9, reason: "HP2" },
        confidence: 0.9,
        budget: { check: "fits", remaining: "500.00", ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      });
      mockGetList.mockImplementation((path: string) => {
        const catalog = codingCatalogGetList(path);
        if (catalog) return Promise.resolve(catalog);
        if (path === SUB_COST_CODES_PATH) {
          return Promise.resolve({
            data: [{ id: 21, public_id: "scc-21", name: "Siding Material", number: "21.00" }],
            count: 1,
          });
        }
        if (path === PROJECTS_PATH) {
          return Promise.resolve({
            data: [
              {
                id: 144,
                public_id: PROJECT_144_PUBLIC_ID,
                name: "Main Street",
                abbreviation: "HP2",
              },
              {
                id: 999,
                public_id: "p-999",
                name: "Other",
                abbreviation: "OTH",
              },
            ],
            count: 2,
          });
        }
        if (path === "/api/v1/get/expense_line_items/expense/1") {
          return Promise.resolve({
            data: [
              expenseLineItemFixture("li-wrong-proj", "Wrong project", "50.00", {
                sub_cost_code_id: null,
                project_id: 999,
              }),
            ],
            count: 1,
          });
        }
        return Promise.reject(new Error(`unexpected getList: ${path}`));
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".status-badge.coding-suggested") !== null,
        "SCC suggestion on mismatched project line",
      );
      expect(container.querySelector("[class*='coding-budget-']")).toBeNull();
    });

    it("shows budget chip when the line project matches the suggestion project", async () => {
      emptyCodingLineMocks({
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: { id: 144, source: "memo_code", confidence: 0.9, reason: "HP2" },
        confidence: 0.9,
        budget: { check: "fits", remaining: "500.00", ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      });
      mockGetList.mockImplementation((path: string) => {
        const catalog = codingCatalogGetList(path);
        if (catalog) return Promise.resolve(catalog);
        if (path === SUB_COST_CODES_PATH) {
          return Promise.resolve({
            data: [{ id: 21, public_id: "scc-21", name: "Siding Material", number: "21.00" }],
            count: 1,
          });
        }
        if (path === PROJECTS_PATH) {
          return Promise.resolve({
            data: [
              {
                id: 144,
                public_id: PROJECT_144_PUBLIC_ID,
                name: "Main Street",
                abbreviation: "HP2",
              },
            ],
            count: 1,
          });
        }
        if (path === "/api/v1/get/expense_line_items/expense/1") {
          return Promise.resolve({
            data: [
              expenseLineItemFixture("li-match-proj", "Matching project", "50.00", {
                sub_cost_code_id: null,
                project_id: 144,
              }),
            ],
            count: 1,
          });
        }
        return Promise.reject(new Error(`unexpected getList: ${path}`));
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".coding-budget-fits") !== null,
        "budget chip on matching project line",
      );
    });

    it("refetches coding suggest after a successful save when the query stays enabled", async () => {
      let suggestCalls = 0;
      const firstSuggest = {
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: null,
        confidence: 0.9,
        budget: { check: "fits", remaining: "500.00", ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      };
      const secondSuggest = {
        ...firstSuggest,
        budget: { check: "tight", remaining: "25.00", ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      };
      emptyCodingLineMocks(firstSuggest);
      mockPost.mockImplementation((path: string) => {
        if (path === EXPENSE_CODING_SUGGEST_PATH) {
          suggestCalls += 1;
          return Promise.resolve(suggestCalls === 1 ? firstSuggest : secondSuggest);
        }
        if (path === REVIEW_SUBMIT_PATH) return Promise.resolve({});
        return Promise.reject(new Error(`unexpected post: ${path}`));
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".coding-budget-fits") !== null,
        "initial budget chip",
      );
      expect(suggestCalls).toBe(1);

      const descriptionInput = inlineLineItemInputForValue(container, "Uncoded line");
      await act(async () => {
        setInputValue(descriptionInput, "Edited after first suggest");
      });
      await clickSave(container);
      await flushUntilHard(
        () => suggestCalls >= 2,
        "second coding suggest POST after save",
      );
      await flushUntilHard(
        () => container.querySelector(".coding-budget-tight") !== null,
        "refetched tight budget chip",
      );
      expect(container.textContent).toContain("Tight: $25.00 left");
    });

    it("keeps the budget chip when a post-save coding suggest refetch fails", async () => {
      let suggestCalls = 0;
      const suggestBody = {
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: null,
        confidence: 0.9,
        budget: { check: "fits", remaining: "500.00", ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      };
      emptyCodingLineMocks(suggestBody);
      mockPost.mockImplementation((path: string) => {
        if (path === EXPENSE_CODING_SUGGEST_PATH) {
          suggestCalls += 1;
          if (suggestCalls === 1) return Promise.resolve(suggestBody);
          return Promise.reject(new Error("suggest refetch failed"));
        }
        if (path === REVIEW_SUBMIT_PATH) return Promise.resolve({});
        return Promise.reject(new Error(`unexpected post: ${path}`));
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".coding-budget-fits") !== null,
        "initial budget chip",
      );

      const descriptionInput = inlineLineItemInputForValue(container, "Uncoded line");
      await act(async () => {
        setInputValue(descriptionInput, "Edited after first suggest");
      });
      await clickSave(container);
      await flushUntilHard(() => suggestCalls >= 2, "failed coding suggest refetch after save");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(container.querySelector(".coding-budget-fits")).not.toBeNull();
      expect(container.textContent).toContain("Within budget");
    });

    it("shows no budget chip when SCC is already filled on the line", async () => {
      emptyCodingLineMocks({
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: null,
        confidence: 0.9,
        budget: { check: "fits", remaining: "100.00", ...EXPENSE_SUGGEST_BUDGET_PROJECT },
      });
      mockGetList.mockImplementation((path: string) => {
        const catalog = codingCatalogGetList(path);
        if (catalog) return Promise.resolve(catalog);
        if (path === SUB_COST_CODES_PATH) {
          return Promise.resolve({
            data: [{ id: 21, public_id: "scc-21", name: "Siding Material", number: "21.00" }],
            count: 1,
          });
        }
        if (path === PROJECTS_PATH) {
          return Promise.resolve({
            data: [
              {
                id: 144,
                public_id: PROJECT_144_PUBLIC_ID,
                name: "Main Street",
                abbreviation: "HP2",
              },
            ],
            count: 1,
          });
        }
        if (path === "/api/v1/get/expense_line_items/expense/1") {
          return Promise.resolve({
            data: [
              expenseLineItemFixture("li-empty", "Coded line", "50.00", {
                sub_cost_code_id: 21,
                project_id: null,
              }),
            ],
            count: 1,
          });
        }
        return Promise.reject(new Error(`unexpected getList: ${path}`));
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(mockPost.mock.calls.filter((c) => c[0] === EXPENSE_CODING_SUGGEST_PATH).length).toBe(1);
      expect(container.querySelector("[class*='coding-budget-']")).toBeNull();
      expect(container.querySelector(".status-badge.coding-suggested")).toBeNull();
    });

    it("tolerates suggest response without budget key", async () => {
      emptyCodingLineMocks({
        status: "suggested",
        sub_cost_code: {
          id: 21,
          source: "memo_shorthand",
          confidence: 0.9,
          reason: "Memo shorthand",
        },
        project: null,
        confidence: 0.9,
      });

      renderExpenseEdit(root);
      await waitForCodingSuggestUi();
      await flushUntilHard(
        () => container.querySelector(".status-badge.coding-suggested") !== null,
        "SCC chip without budget key",
      );
      expect(container.querySelector("[class*='coding-budget-']")).toBeNull();
    });
  });
});

describe("ExpenseEdit document header (U-683b)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetListResolvedForAll({ data: [], count: 0 });
    mockGetOne.mockImplementation((path: string) => {
      if (path === EXPENSE_GET_PATH) {
        return Promise.resolve(sampleExpense({ is_draft: true }));
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });
    mockPut.mockResolvedValue(sampleExpense({ row_version: "rv-2", is_draft: true }));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  function headerLabels(): string[] {
    return Array.from(container.querySelectorAll(".detail-fields-form label")).map((l) =>
      l.textContent?.replace(/\*/g, "").trim() ?? "",
    );
  }

  it("header labels follow Vendor → Reference Number → Expense Date → Total Amount → Memo → Is Credit", async () => {
    renderExpenseEdit(root);
    await flushUntil(() => container.querySelector(".detail-fields-form") !== null);
    expect(headerLabels()).toEqual([
      "Vendor",
      "Reference Number",
      "Expense Date",
      "Total Amount",
      "Memo",
      "Is Credit",
    ]);
  });

  it("requires reference number and expense date but not vendor on edit", async () => {
    renderExpenseEdit(root);
    await flushUntil(() => vendorCombobox(container) !== null);
    expect(comboboxInput(vendorCombobox(container)).hasAttribute("required")).toBe(false);
    expect(container.querySelector('input[name="reference_number"]')?.hasAttribute("required")).toBe(
      true,
    );
    expect(container.querySelector('input[name="expense_date"]')?.hasAttribute("required")).toBe(true);
  });
});
