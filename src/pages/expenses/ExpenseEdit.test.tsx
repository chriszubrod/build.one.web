import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ExpenseEdit from "./ExpenseEdit";
import { ApiError } from "../../api/client";
import type { Expense } from "../../types/api";
import { setInputValue, setTextareaValue } from "../../__testutils__/domEvents";
import { flushUntil } from "../../__testutils__/flush";
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
const LINE_CREATE_PATH = "/api/v1/create/expense_line_item";
const ELIA_BY_LINE_PREFIX = "/api/v1/get/expense-line-item-attachment/by-expense-line-item/";
const ELIA_CREATE_PATH = "/api/v1/create/expense-line-item-attachment";
const STALE_COMPLETION_RESULT_PATH = "/api/v1/get/expense/exp-1/completion-result";

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();
const mockToast = vi.fn();
const mockNavigate = vi.fn();

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
    data: { vendors: [] },
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
function expenseLineItemFixture(publicId: string, description: string, amount: string) {
  const suffix = publicId.replace(/^li-/, "");
  return {
    public_id: publicId,
    row_version: `rv-${suffix}`,
    description,
    sub_cost_code_id: null,
    quantity: null,
    rate: null,
    amount,
    is_billable: true,
    markup: null,
    price: null,
  };
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

    mockGetList.mockResolvedValue({ data: [], count: 0 });
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

    mockGetList.mockResolvedValue({
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

    mockGetList.mockResolvedValue({
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

    const callsBefore = mockGetOne.mock.calls.length;
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

    expect(mockGetOne.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(mockGetOne.mock.calls.at(-1)?.[0]).toBe(EXPENSE_GET_PATH);
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

    mockGetList.mockResolvedValue({ data: [], count: 0 });
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
    mockGetList.mockResolvedValue({
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
    expect(mockGetList.mock.calls.length).toBeGreaterThan(listCallsBefore);

    // Controlled inputs keep .value after re-hydrate; only stable uid keys preserve the node.
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

    mockGetList.mockResolvedValue({ data: [], count: 0 });

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

  it("saveAll after flushAutoSave sends the token returned by the flush PUT, not stale form state", async () => {
    renderExpenseEdit(root);
    await waitForReady(container);
    await flushMicrotasks();

    const refInput = container.querySelector('input[name="reference_number"]') as HTMLInputElement;
    expect(refInput).not.toBeNull();

    await act(async () => {
      refInput.value = "EXP-EDITED";
      refInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Debounced auto-save is scheduled but must not fire before Complete.
    expect(headerPutBodies()).toHaveLength(0);

    const btn = completeButton(container);
    expect(btn).not.toBeNull();
    await act(async () => {
      btn!.click();
      await flushMicrotasks();
    });

    const bodies = headerPutBodies();
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    expect(bodies[0].row_version).toBe("rv-1");
    expect(bodies[1].row_version).toBe("rv-2");
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
    mockGetList.mockResolvedValue({ data: [], count: 0 });
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

    mockGetList.mockResolvedValue({
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
    mockGetList.mockResolvedValue({
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
    mockGetList.mockResolvedValue({ data: [], count: 0 });
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
    mockGetList.mockResolvedValue({ data: lines, count: lines.length });
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
    mockPost.mockImplementation((path: string) =>
      Promise.reject(new Error(`unexpected post: ${path}`)),
    );

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

    expect(mockPost).not.toHaveBeenCalled();
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

  it("saveAll cancels an armed auto-save debounce so a slow re-home GET issues only one header PUT", async () => {
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    expect(expenseHeaderPutBodies()).toHaveLength(0);

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

    mockGetList.mockResolvedValue({
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

  it("cancels an already-armed debounce so a failed save does not fire a follow-up header PUT", async () => {
    renderExpenseEdit(root);
    await waitForReady(container);
    await flushUntil(() => inlineLineItemRows(container).length === 1);

    const memo = container.querySelector('textarea[name="memo"]') as HTMLTextAreaElement;
    expect(memo).not.toBeNull();
    await act(async () => {
      setTextareaValue(memo, "typed before failing save");
    });
    // Timer is armed (300ms) but must not fire before Save.
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

