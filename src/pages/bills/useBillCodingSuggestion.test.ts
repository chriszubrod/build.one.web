import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, useState } from "react";
import { renderHook, drain } from "../../hooks/__testutils__/renderHook";
import { useBillCodingSuggestion } from "./useBillCodingSuggestion";
import type { LineCodingFields } from "./codingSuggestion";

const mockSuggestCoding = vi.fn();

vi.mock("./codingSuggestion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./codingSuggestion")>();
  return {
    ...actual,
    suggestCoding: (...args: unknown[]) => mockSuggestCoding(...args),
  };
});

type Line = LineCodingFields & { uid: string; amount?: string };

function line(partial: Partial<Line> & Pick<Line, "uid">): Line {
  return {
    sub_cost_code_id: "",
    project_public_id: "",
    amount: "",
    ...partial,
  };
}

const catalog = [
  { id: 10, public_id: "scc-a" },
  { id: 20, public_id: "scc-b" },
];

const resp = (o: Record<string, unknown> = {}) => ({
  sub_cost_code_public_id: "scc-a",
  project_public_id: "p-1",
  source: "vendor_history",
  reason: "r",
  budget_check: "fits",
  budget_remaining: "1.00",
  confidence: 0.8,
  ...o,
});

function Harness(props: {
  initialLines: Line[];
  memo?: string;
  debouncedMemo?: string;
  debouncedAmount?: string;
  sccCatalog?: typeof catalog;
  vendor?: string;
}) {
  const [lines, setLines] = useState(props.initialLines);
  const [memo, setMemo] = useState(props.memo ?? "memo");
  const [debouncedMemo, setDebouncedMemo] = useState(props.debouncedMemo ?? props.memo ?? "memo");
  const [debouncedAmount, setDebouncedAmount] = useState<string | undefined>(
    props.debouncedAmount,
  );
  const [sccCatalog, setSccCatalog] = useState(props.sccCatalog ?? catalog);
  const [vendor, setVendor] = useState(props.vendor ?? "v-1");

  const { budgetChip } = useBillCodingSuggestion({
    enabled: true,
    vendor_public_id: vendor,
    memo,
    debouncedMemo,
    debouncedAmount,
    projectHintForSuggest: undefined,
    lines,
    sccCatalog,
    setLines,
  });

  return {
    budgetChip,
    lines,
    setMemo,
    setDebouncedMemo,
    setDebouncedAmount,
    setSccCatalog,
    setLines,
    setVendor,
  };
}

function renderHarness(initial: Parameters<typeof Harness>[0]) {
  return renderHook(() => Harness(initial));
}

const tick = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    await drain();
  });
};

function deferred() {
  const pending: Array<(v: unknown) => void> = [];
  mockSuggestCoding.mockImplementation(() => new Promise((r) => pending.push(r)));
  return pending;
}

describe("useBillCodingSuggestion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSuggestCoding.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("r6-1 memo edit reverted within 400 ms during slow request still applies response", async () => {
    let resolveSlow!: (value: unknown) => void;
    mockSuggestCoding.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSlow = resolve;
        }),
    );

    const h = renderHarness({
      initialLines: [line({ uid: "a", project_public_id: "p-1", amount: "100.00" })],
      debouncedAmount: "100.00",
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockSuggestCoding).toHaveBeenCalledTimes(1);

    await act(async () => {
      h.result.current.setMemo("draft");
      h.rerender();
    });

    await act(async () => {
      h.result.current.setMemo("memo");
      h.result.current.setDebouncedMemo("memo");
      h.rerender();
    });

    await act(async () => {
      resolveSlow({
        sub_cost_code_public_id: "scc-a",
        project_public_id: "p-1",
        source: "vendor_history",
        budget_check: "fits",
        budget_remaining: "1.00",
        confidence: 0.8,
      });
      await drain();
    });

    expect(h.result.current.lines[0].sub_cost_code_id).toBe("10");
    expect(h.result.current.budgetChip?.label).toBe("Within budget");
    expect(mockSuggestCoding).toHaveBeenCalledTimes(1);
  });

  it("r6-1 SCC catalog finishing load mid-flight does not drop a same-key response", async () => {
    let resolveSlow!: (value: unknown) => void;
    mockSuggestCoding.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSlow = resolve;
        }),
    );

    const h = renderHarness({
      initialLines: [line({ uid: "a", project_public_id: "p-1", amount: "100.00" })],
      debouncedAmount: "100.00",
      sccCatalog: [],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      h.result.current.setSccCatalog(catalog);
      h.rerender();
    });

    await act(async () => {
      resolveSlow({
        sub_cost_code_public_id: "scc-a",
        project_public_id: "p-1",
        source: "vendor_history",
        budget_check: "fits",
        budget_remaining: "0",
        confidence: 0.8,
      });
      await drain();
    });

    expect(h.result.current.lines[0].sub_cost_code_id).toBe("10");
    expect(h.result.current.budgetChip?.label).toBe("Within budget");
    expect(mockSuggestCoding).toHaveBeenCalledTimes(1);
  });

  describe("arrival check (r7)", () => {
    it("r7-1 a response arriving after the vendor was cleared fills nothing, even after a same-key rerun", async () => {
      const pending = deferred();
      const h = renderHook(() =>
        Harness({ initialLines: [line({ uid: "a", project_public_id: "p-1", amount: "100.00" })] }),
      );
      await tick();
      expect(mockSuggestCoding).toHaveBeenCalledTimes(1);
      await act(async () => h.result.current.setDebouncedAmount("100.00"));
      await tick();
      await act(async () => h.result.current.setVendor(""));
      await tick();
      await act(async () => pending[0](resp()));
      await tick();
      expect(h.result.current.lines[0].sub_cost_code_id).toBe("");

      mockSuggestCoding.mockResolvedValue(resp({ sub_cost_code_public_id: "scc-b" }));
      await act(async () => h.result.current.setVendor("v-2"));
      await tick();
      expect(h.result.current.lines[0].sub_cost_code_id).toBe("20");
    });

    it("r7-1 a response arriving after a covered line's amount changed fills nothing", async () => {
      const pending = deferred();
      const h = renderHook(() =>
        Harness({
          initialLines: [
            line({ uid: "a", project_public_id: "p-1", amount: "100.00" }),
            line({ uid: "b", project_public_id: "p-1", amount: "5.00" }),
          ],
          debouncedAmount: "105.00",
        }),
      );
      await tick();
      expect(mockSuggestCoding).toHaveBeenCalledTimes(1);
      await act(async () =>
        h.result.current.setLines((p) =>
          p.map((l) => (l.uid === "b" ? { ...l, amount: "50.00" } : l)),
        ),
      );
      await tick();
      await act(async () => pending[0](resp({ budget_check: "tight", budget_remaining: "5.00" })));
      await tick();
      expect(h.result.current.lines.map((l) => l.sub_cost_code_id)).toEqual(["", ""]);
      expect(h.result.current.budgetChip).toBeNull();
    });

    it("r7-1 a memo typed mid-flight drops the response; typed back to the asked memo, it applies", async () => {
      const pending = deferred();
      const h = renderHook(() =>
        Harness({
          initialLines: [line({ uid: "a", project_public_id: "p-1", amount: "100.00" })],
          debouncedAmount: "100.00",
        }),
      );
      await tick();
      await act(async () => h.result.current.setMemo("memo x"));
      await act(async () => pending[0](resp()));
      await tick();
      expect(h.result.current.lines[0].sub_cost_code_id).toBe("");

      const again = deferred();
      await act(async () => h.result.current.setMemo("memo"));
      await tick();
      expect(mockSuggestCoding).toHaveBeenCalledTimes(2);
      await act(async () => again[0](resp()));
      await tick();
      expect(h.result.current.lines[0].sub_cost_code_id).toBe("10");
      expect(h.result.current.budgetChip?.label).toBe("Within budget");
    });

    it("r7-2 nothing is asked until the SCC catalog has loaded; then the SCC fills and the chip shows", async () => {
      mockSuggestCoding.mockResolvedValue(resp());
      const h = renderHook(() =>
        Harness({
          initialLines: [line({ uid: "a", project_public_id: "p-1", amount: "100.00" })],
          debouncedAmount: "100.00",
          sccCatalog: [],
        }),
      );
      await tick(1000);
      expect(mockSuggestCoding).not.toHaveBeenCalled();
      await act(async () => h.result.current.setSccCatalog(catalog));
      await tick();
      expect(mockSuggestCoding).toHaveBeenCalledTimes(1);
      expect(h.result.current.lines[0].sub_cost_code_id).toBe("10");
      expect(h.result.current.budgetChip?.label).toBe("Within budget");
    });

    it("r7-2 a suggested SCC the catalog cannot map shows no chip", async () => {
      mockSuggestCoding.mockResolvedValue(
        resp({ sub_cost_code_public_id: "scc-zzz", budget_check: "over", budget_remaining: "-50.00" }),
      );
      const h = renderHook(() =>
        Harness({
          initialLines: [line({ uid: "a", project_public_id: "p-1", amount: "100.00" })],
          debouncedAmount: "100.00",
        }),
      );
      await tick();
      expect(mockSuggestCoding).toHaveBeenCalledTimes(1);
      expect(h.result.current.lines[0].sub_cost_code_id).toBe("");
      expect(h.result.current.budgetChip).toBeNull();
    });

    it("r7-3 a line whose SCC the user cleared is not in the amount or the chip's coverage", async () => {
      mockSuggestCoding.mockResolvedValue(resp());
      const h = renderHook(() =>
        Harness({
          initialLines: [
            line({ uid: "a", project_public_id: "p-1", amount: "100.00" }),
            line({ uid: "b", project_public_id: "p-1", amount: "5.00", coding_scc_touched: true }),
          ],
          debouncedAmount: "100.00",
        }),
      );
      await tick();
      expect(mockSuggestCoding.mock.calls[0][0].amount).toBe("100.00");
      expect(h.result.current.lines.map((l) => l.sub_cost_code_id)).toEqual(["10", ""]);
      expect(h.result.current.budgetChip?.label).toBe("Within budget");
    });
  });
});
