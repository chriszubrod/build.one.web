import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ExpenseEdit from "./ExpenseEdit";
import type { Expense } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EXPENSE_GET_PATH = "/api/v1/get/expense/exp-1";
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

describe("ExpenseEdit chained-save row_version", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockGetOne.mockImplementation((path: string) => {
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
