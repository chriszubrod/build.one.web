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

  function renderExpenseEdit() {
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
                path: "/expense/:id/edit",
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
      for (let i = 0; i < 30; i++) {
        await Promise.resolve();
      }
    });
  }

  async function waitForReady() {
    await act(async () => {
      for (let i = 0; i < 50; i++) {
        await vi.advanceTimersByTimeAsync(0);
        await Promise.resolve();
        if (container.textContent?.includes("Complete Expense")) {
          return;
        }
      }
    });
    expect(container.textContent).toContain("Complete Expense");
  }

  function completeButton(): HTMLButtonElement | null {
    const buttons = container.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent?.includes("Complete Expense") || btn.textContent?.includes("Completing...")) {
        return btn as HTMLButtonElement;
      }
    }
    return null;
  }

  async function clickCompleteExpense() {
    const btn = completeButton();
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
    renderExpenseEdit();
    await waitForReady();
    const baseline = expenseGetCallCount();
    await clickCompleteExpense();

    await advancePollInterval(1);

    assertNeverPolledCompletionResult();
    expect(expenseGetCallCount()).toBeGreaterThan(baseline);
  });

  it("does not settle while the expense is still a draft", async () => {
    setupGetOnePollResponses([true, true]);
    renderExpenseEdit();
    await waitForReady();
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
    renderExpenseEdit();
    await waitForReady();
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
