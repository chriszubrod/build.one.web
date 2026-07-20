import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ExpenseCodingCockpit from "./ExpenseCodingCockpit";
import { ApiError } from "../../api/client";
import {
  buildConfirmPayload,
  computeAutoClearedPct,
  computeWasOverridden,
  confidenceTier,
  confirmResultToast,
  formatAutoClearedPct,
  formatConfidencePct,
  initialSelectionFromRow,
  recodeWritesOff,
  sortQueueByConfidence,
} from "./expenseCodingLogic";
import type { ExpenseCodingMetrics, ExpenseCodingQueueRow } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockToast = vi.fn();

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: (...args: unknown[]) => mockPost(...args),
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
      projects: [
        { id: 10, public_id: "proj-aaa", name: "Oak Ridge", abbreviation: null },
        { id: 20, public_id: "proj-bbb", name: "Millrace", abbreviation: null },
      ],
      sub_cost_codes: [
        { id: 7, public_id: "scc-777", number: "7.00", name: "General Conditions", cost_code_id: 1 },
        { id: 8, public_id: "scc-888", number: "8.00", name: "Sitework", cost_code_id: 2 },
      ],
    },
    loading: false,
  }),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

function sampleRow(overrides: Partial<ExpenseCodingQueueRow> = {}): ExpenseCodingQueueRow {
  return {
    qbo_purchase_public_id: "purchase-1",
    qbo_purchase_qbo_id: "123",
    sync_token: "0",
    realm_id: "realm",
    vendor_qbo_id: "v1",
    vendor_name: "Home Depot",
    credit: false,
    total_amt: "150.00",
    txn_date: "2026-01-15",
    doc_number: "1001",
    private_note: "266 lumber for framing",
    qbo_purchase_line_id: 42,
    qbo_line_id: "1",
    line_num: 1,
    line_amount: "75.50",
    line_description: null,
    coding_item_public_id: "coding-item-1",
    coding_status: "suggested",
    suggested_project_id: 10,
    suggested_sub_cost_code_id: 7,
    suggested_description: "Framing lumber",
    suggestion_source: "vendor_history",
    suggestion_reason: "vendor coded to SCC 7.00 in 266/288 priors",
    suggestion_confidence: 0.92,
    confirmed_project_id: null,
    confirmed_sub_cost_code_id: null,
    confirmed_description: null,
    flag_reason: null,
    vendor_id: 5,
    claimed_by_user_id: null,
    claimed_at: null,
    ...overrides,
  };
}

function sampleMetrics(overrides: Partial<ExpenseCodingMetrics> = {}): ExpenseCodingMetrics {
  return {
    total_target_lines: 100,
    pending_count: 10,
    suggested_count: 50,
    flagged_count: 5,
    confirmed_count: 20,
    enqueued_count: 10,
    written_count: 15,
    changed_in_qbo_count: 2,
    error_count: 1,
    accepted_count: 80,
    overridden_count: 12,
    ...overrides,
  };
}

describe("expenseCodingLogic", () => {
  it("was_overridden is false when confirming unchanged suggestion", () => {
    const row = sampleRow();
    const selection = initialSelectionFromRow(row);
    expect(computeWasOverridden(selection, row)).toBe(false);
  });

  it("was_overridden is true when Project/SCC/Description differ from suggestion", () => {
    const row = sampleRow();
    expect(
      computeWasOverridden(
        { projectId: 20, subCostCodeId: 7, description: "Framing lumber" },
        row,
      ),
    ).toBe(true);
    expect(
      computeWasOverridden(
        { projectId: 10, subCostCodeId: 8, description: "Framing lumber" },
        row,
      ),
    ).toBe(true);
    expect(
      computeWasOverridden(
        { projectId: 10, subCostCodeId: 7, description: "Changed desc" },
        row,
      ),
    ).toBe(true);
  });

  it("confirm POST body carries selected options' public_ids", () => {
    const payload = buildConfirmPayload("proj-aaa", "scc-777", "Framing lumber", false);
    expect(payload).toEqual({
      project_public_id: "proj-aaa",
      sub_cost_code_public_id: "scc-777",
      description: "Framing lumber",
      was_overridden: false,
    });
  });

  it("Auto-cleared % computes and is 0% when total is 0", () => {
    expect(formatAutoClearedPct(sampleMetrics())).toBe("80.0%");
    expect(computeAutoClearedPct(sampleMetrics({ total_target_lines: 0, accepted_count: 0 }))).toBe(0);
    expect(formatAutoClearedPct(sampleMetrics({ total_target_lines: 0, accepted_count: 0 }))).toBe("0.0%");
  });
});

describe("confidenceTier", () => {
  it("tiers ratio-scale confidence at the documented boundaries", () => {
    expect(confidenceTier(0.95)).toBe("high");
    expect(confidenceTier(0.9)).toBe("high"); // >= 0.90 is High
    expect(confidenceTier(0.8999)).toBe("medium");
    expect(confidenceTier(0.6)).toBe("medium"); // >= 0.60 is Medium
    expect(confidenceTier(0.5999)).toBe("low");
    expect(confidenceTier(0.19)).toBe("low");
    expect(confidenceTier(0)).toBe("low");
  });

  it("normalizes percent-scale confidence the same as ratio-scale", () => {
    expect(confidenceTier(1)).toBe("high"); // exactly 1 is a ratio (100%)
    expect(confidenceTier(95)).toBe("high");
    expect(confidenceTier(60)).toBe("medium");
    expect(confidenceTier(19)).toBe("low");
  });

  it("returns 'none' for null and non-finite confidence", () => {
    expect(confidenceTier(null)).toBe("none");
    expect(confidenceTier(Number.NaN)).toBe("none");
    expect(confidenceTier(Number.POSITIVE_INFINITY)).toBe("none");
  });
});

describe("formatConfidencePct", () => {
  it("renders a rounded percent for ratio and percent scales, null otherwise", () => {
    expect(formatConfidencePct(0.92)).toBe("92%");
    expect(formatConfidencePct(0.195)).toBe("20%");
    expect(formatConfidencePct(92)).toBe("92%");
    expect(formatConfidencePct(1)).toBe("100%");
    expect(formatConfidencePct(null)).toBeNull();
    expect(formatConfidencePct(Number.NaN)).toBeNull();
  });
});

describe("sortQueueByConfidence", () => {
  const rowWith = (confidence: number | null, id: number) =>
    sampleRow({ suggestion_confidence: confidence, qbo_purchase_line_id: id });

  it("orders highest confidence first", () => {
    const sorted = sortQueueByConfidence([
      rowWith(0.19, 1),
      rowWith(0.95, 2),
      rowWith(0.6, 3),
    ]);
    expect(sorted.map((r) => r.qbo_purchase_line_id)).toEqual([2, 3, 1]);
  });

  it("sinks null/no-suggestion rows to the bottom as a distinct group", () => {
    const sorted = sortQueueByConfidence([
      rowWith(0.5, 1),
      rowWith(null, 2),
      rowWith(0.9, 3),
      rowWith(null, 4),
    ]);
    expect(sorted.map((r) => r.qbo_purchase_line_id)).toEqual([3, 1, 2, 4]);
    expect(sorted[sorted.length - 1].suggestion_confidence).toBeNull();
  });

  it("is stable: equal confidence and the null group keep server order", () => {
    const sorted = sortQueueByConfidence([
      rowWith(0.5, 1),
      rowWith(0.5, 2),
      rowWith(0.5, 3),
      rowWith(null, 4),
      rowWith(null, 5),
    ]);
    expect(sorted.map((r) => r.qbo_purchase_line_id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not mutate the input array", () => {
    const input = [rowWith(0.1, 1), rowWith(0.9, 2)];
    const before = input.map((r) => r.qbo_purchase_line_id);
    const sorted = sortQueueByConfidence(input);
    expect(input.map((r) => r.qbo_purchase_line_id)).toEqual(before);
    expect(sorted).not.toBe(input);
  });
});

describe("recodeWritesOff", () => {
  it("is off ONLY when the api explicitly reports false", () => {
    expect(recodeWritesOff(sampleMetrics({ recode_writes_enabled: false }))).toBe(true);
    expect(recodeWritesOff(sampleMetrics({ recode_writes_enabled: true }))).toBe(false);
    expect(recodeWritesOff(sampleMetrics())).toBe(false); // pre-U-058a payload
    expect(recodeWritesOff(undefined)).toBe(false); // metrics not loaded yet
  });
});

describe("confirmResultToast", () => {
  it("is success ONLY on enqueued === true; anything else reads as an error", () => {
    expect(confirmResultToast({ enqueued: true })).toEqual({
      message: "Expense coding confirmed",
      kind: "success",
    });
    expect(confirmResultToast({ enqueued: false })).toEqual({
      message: "Coding recorded but NOT sent to QBO",
      kind: "error",
    });
    expect(confirmResultToast({})).toEqual({
      message: "Coding recorded but NOT sent to QBO",
      kind: "error",
    });
    expect(confirmResultToast({ enqueued: false, reason: "writes gate off" })).toEqual({
      message: "Coding recorded but NOT sent to QBO — writes gate off",
      kind: "error",
    });
  });
});

describe("ExpenseCodingCockpit", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetList.mockResolvedValue({ data: [sampleRow()], count: 1 });
    mockGetOne.mockResolvedValue(sampleMetrics());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  function renderCockpit() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(ExpenseCodingCockpit),
          ),
        ),
      );
    });
  }

  async function waitForQueue() {
    await act(async () => {
      await vi.waitFor(
        () => {
          expect(container.textContent).toContain("Home Depot");
        },
        { timeout: 2000 },
      );
    });
  }

  async function expandFirstRow() {
    const summary = container.querySelector(".expense-coding-row-summary") as HTMLButtonElement;
    expect(summary).not.toBeNull();
    await act(async () => {
      summary.click();
    });
  }

  function confirmButton(): HTMLButtonElement | null {
    return container.querySelector(
      ".expense-coding-row-actions .btn-primary",
    ) as HTMLButtonElement | null;
  }

  it("renders queue row memo, vendor, amount, and status badge", async () => {
    renderCockpit();
    await waitForQueue();

    expect(container.textContent).toContain("266 lumber for framing");
    expect(container.textContent).toContain("$75.50");
    expect(container.textContent).toContain("Suggested");
    expect(container.textContent).toContain("Auto-cleared");
    expect(container.textContent).toContain("80.0%");
  });

  it("renders a confidence badge in the row header", async () => {
    renderCockpit();
    await waitForQueue();

    // sampleRow() has suggestion_confidence 0.92 → High tier, 92%.
    const badge = container.querySelector(".expense-coding-confidence-badge--high");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain("High");
    expect(badge?.textContent).toContain("92%");
  });

  it("shows gate banner and disables Confirm when recode_writes_enabled is false", async () => {
    mockGetOne.mockResolvedValue(sampleMetrics({ recode_writes_enabled: false }));
    renderCockpit();
    await waitForQueue();

    expect(container.querySelector(".expense-coding-gate-banner")).not.toBeNull();
    expect(container.textContent).toContain(
      "Recode writes are disabled — Confirm is blocked; nothing will be sent to QBO.",
    );

    await expandFirstRow();
    expect(confirmButton()?.disabled).toBe(true);

    // Gate blocks ONLY Confirm — Flag and Generate suggestions are not QBO
    // recode writes and must stay usable.
    const flagBtn = container.querySelector(
      ".expense-coding-row-actions .btn-secondary",
    ) as HTMLButtonElement | null;
    expect(flagBtn?.disabled).toBe(false);
    const suggestBtn = container.querySelector(
      ".expense-coding-metrics-actions .btn-primary",
    ) as HTMLButtonElement | null;
    expect(suggestBtn?.disabled).toBe(false);
  });

  const gateEnabledCases: Array<[string, Partial<ExpenseCodingMetrics>]> = [
    ["true", { recode_writes_enabled: true }],
    ["omitted", {}],
  ];
  it.each(gateEnabledCases)(
    "hides gate banner and enables Confirm when recode_writes_enabled is %s",
    async (_label, overrides) => {
      mockGetOne.mockResolvedValue(sampleMetrics(overrides));
      renderCockpit();
      await waitForQueue();

      expect(container.querySelector(".expense-coding-gate-banner")).toBeNull();

      await expandFirstRow();
      expect(confirmButton()?.disabled).toBe(false);
    },
  );

  it("toasts success when confirm enqueues to QBO", async () => {
    mockPost.mockResolvedValue({ ...sampleRow(), enqueued: true });
    renderCockpit();
    await waitForQueue();
    await expandFirstRow();

    await act(async () => {
      confirmButton()?.click();
      await vi.waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith("Expense coding confirmed", "success");
      });
    });
  });

  it("toasts error (not success) when confirm records coding but does not enqueue", async () => {
    mockPost.mockResolvedValue({ enqueued: false, reason: "writes gate off" });
    renderCockpit();
    await waitForQueue();
    await expandFirstRow();

    const queueCallsBefore = mockGetList.mock.calls.length;

    await act(async () => {
      confirmButton()?.click();
      await vi.waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          "Coding recorded but NOT sent to QBO — writes gate off",
          "error",
        );
      });
    });

    expect(mockToast).not.toHaveBeenCalledWith("Expense coding confirmed", "success");

    // A 2xx recorded server state even without the enqueue — the queue must
    // refetch so the row/counts reflect it.
    await act(async () => {
      await vi.waitFor(() => {
        expect(mockGetList.mock.calls.length).toBeGreaterThan(queueCallsBefore);
      });
    });
  });

  it("toasts blocked error and refetches metrics on confirm 422", async () => {
    mockPost.mockRejectedValue(new ApiError(422, "Recode writes are disabled"));
    renderCockpit();
    await waitForQueue();
    await expandFirstRow();

    const metricsCallsBefore = mockGetOne.mock.calls.filter(
      (c) => c[0] === "/api/v1/expense-coding/metrics",
    ).length;

    await act(async () => {
      confirmButton()?.click();
      await vi.waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          "Blocked: recode writes are disabled — nothing was sent to QBO",
          "error",
        );
      });
    });

    await act(async () => {
      await vi.waitFor(() => {
        const metricsCallsAfter = mockGetOne.mock.calls.filter(
          (c) => c[0] === "/api/v1/expense-coding/metrics",
        ).length;
        expect(metricsCallsAfter).toBeGreaterThan(metricsCallsBefore);
      });
    });
  });
});
