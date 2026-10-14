import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "../../api/client";
import {
  applySuggestionToLines,
  applyUserCodingFieldChange,
  nextPrefillState,
  parseConfidence,
  formatSuggestionBadgeLabel,
  isLowConfidence,
  projectHintFromEmptySccLines,
  suggestCoding,
  resetSuggestCodingForTests,
  suggestionBadgeClassName,
  type BillCodingSuggestion,
  type LineCodingFields,
} from "./codingSuggestion";

const mockRawRequest = vi.fn();

vi.mock("../../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../api/client")>();
  return {
    ...mod,
    rawRequest: (...args: unknown[]) => mockRawRequest(...args),
  };
});

function sampleSuggestion(overrides: Partial<BillCodingSuggestion> = {}): BillCodingSuggestion {
  return {
    project_public_id: "p-1",
    project_name: "P One",
    sub_cost_code_public_id: "scc-pub",
    sub_cost_code_number: "01",
    sub_cost_code_name: "Labor",
    source: "vendor_history",
    reason: "Most recent bill for this vendor",
    confidence: 0.72,
    model_version: "v1",
    ...overrides,
  };
}

type DraftLine = LineCodingFields & { uid: string };

function emptyLine(uid: string): DraftLine {
  return { uid, sub_cost_code_id: "", project_public_id: "" };
}

const catalog = [{ id: 42, public_id: "scc-pub" }];

describe("applySuggestionToLines", () => {
  it("fills only empty SCC and project cells", () => {
    const lines = [
      emptyLine("a"),
      { ...emptyLine("b"), sub_cost_code_id: "99", project_public_id: "" },
      { ...emptyLine("c"), sub_cost_code_id: "", project_public_id: "existing" },
    ];
    const out = applySuggestionToLines(lines, sampleSuggestion(), catalog);
    expect(out[0].sub_cost_code_id).toBe("42");
    expect(out[0].project_public_id).toBe("p-1");
    expect(out[0].coding_prefill_state).toBe("prefilled");
    expect(out[1].sub_cost_code_id).toBe("99");
    expect(out[1].project_public_id).toBe("p-1");
    expect(out[1].coding_prefill_state).toBe("prefilled");
    expect(out[2].sub_cost_code_id).toBe("");
    expect(out[2].project_public_id).toBe("existing");
    expect(out[2].coding_prefill_state).toBeUndefined();
  });

  it("never overwrites user-entered SCC or project", () => {
    const lines = [
      { ...emptyLine("a"), sub_cost_code_id: "7", project_public_id: "user-proj" },
    ];
    const out = applySuggestionToLines(lines, sampleSuggestion(), catalog);
    expect(out[0]).toEqual(lines[0]);
  });

  it("maps sub_cost_code_public_id to numeric option id", () => {
    const lines = [emptyLine("a")];
    const out = applySuggestionToLines(
      lines,
      sampleSuggestion({ sub_cost_code_public_id: "missing-pub" }),
      catalog,
    );
    expect(out[0].sub_cost_code_id).toBe("");
    expect(out[0].project_public_id).toBe("p-1");
    expect(out[0].coding_prefill_state).toBe("prefilled");
  });

  it("no-ops when source is none", () => {
    const lines = [emptyLine("a")];
    const out = applySuggestionToLines(
      lines,
      sampleSuggestion({ source: "none", sub_cost_code_public_id: null, project_public_id: null }),
      catalog,
    );
    expect(out).toEqual(lines);
  });

  it("r1-1 does not prefill SCC or project on user-touched empty cells", () => {
    const lines: DraftLine[] = [
      {
        ...emptyLine("a"),
        coding_scc_touched: true,
        coding_prefill_state: "changed",
      },
      {
        ...emptyLine("b"),
        coding_project_touched: true,
        coding_prefill_state: "changed",
      },
    ];
    const out = applySuggestionToLines(lines, sampleSuggestion(), catalog);
    expect(out[0].sub_cost_code_id).toBe("");
    expect(out[0].coding_prefill_state).toBe("changed");
    expect(out[1].project_public_id).toBe("");
    expect(out[1].coding_prefill_state).toBe("changed");
  });

  it("r1-2 skips lines with unresolved_project_id", () => {
    const lines: DraftLine[] = [{ ...emptyLine("a"), unresolved_project_id: 144 }];
    const out = applySuggestionToLines(lines, sampleSuggestion(), catalog);
    expect(out[0]).toEqual(lines[0]);
  });

  it("r2-4 does not prefill SCC on a line whose project differs from the suggestion project", () => {
    const lines: DraftLine[] = [
      { ...emptyLine("proj-a"), project_public_id: "p-a" },
      { ...emptyLine("proj-b"), project_public_id: "p-b" },
      emptyLine("no-proj"),
    ];
    const suggestion = sampleSuggestion({
      project_public_id: "p-b",
      sub_cost_code_public_id: "scc-pub",
    });
    const out = applySuggestionToLines(lines, suggestion, catalog);
    expect(out[0].sub_cost_code_id).toBe("");
    expect(out[0].project_public_id).toBe("p-a");
    expect(out[0].coding_prefill_state).toBeUndefined();
    expect(out[1].sub_cost_code_id).toBe("42");
    expect(out[1].project_public_id).toBe("p-b");
    expect(out[1].coding_prefill_state).toBe("prefilled");
    expect(out[2].sub_cost_code_id).toBe("42");
    expect(out[2].project_public_id).toBe("p-b");
    expect(out[2].coding_prefill_state).toBe("prefilled");
  });
});

describe("projectHintFromEmptySccLines", () => {
  it("r1-4 returns shared project when all empty-SCC lines agree", () => {
    const hint = projectHintFromEmptySccLines([
      { sub_cost_code_id: "", project_public_id: "p-a", unresolved_project_id: undefined },
      { sub_cost_code_id: "9", project_public_id: "p-b", unresolved_project_id: undefined },
      { sub_cost_code_id: "", project_public_id: "p-a", unresolved_project_id: undefined },
    ]);
    expect(hint).toBe("p-a");
  });

  it("r1-4 returns undefined when empty-SCC lines disagree on project", () => {
    const hint = projectHintFromEmptySccLines([
      { sub_cost_code_id: "", project_public_id: "p-a", unresolved_project_id: undefined },
      { sub_cost_code_id: "", project_public_id: "p-b", unresolved_project_id: undefined },
    ]);
    expect(hint).toBeUndefined();
  });

  it("r1-4 ignores inaccessible projects", () => {
    const hint = projectHintFromEmptySccLines([
      { sub_cost_code_id: "", project_public_id: "", unresolved_project_id: 144 },
    ]);
    expect(hint).toBeUndefined();
  });
});

describe("applyUserCodingFieldChange (r2-P)", () => {
  it("r2-P transitions accepted to changed when SCC value changes from current hold", () => {
    const line: LineCodingFields = {
      sub_cost_code_id: "42",
      project_public_id: "p-1",
      coding_prefill_state: "accepted",
    };
    const next = applyUserCodingFieldChange(line, "sub_cost_code_id", "99");
    expect(next.coding_prefill_state).toBe("changed");
    expect(next.coding_scc_touched).toBe(true);
  });

  it("r2-P does not transition when value unchanged (no in-session suggested baseline)", () => {
    const line: LineCodingFields = {
      sub_cost_code_id: "42",
      project_public_id: "",
      coding_prefill_state: "accepted",
    };
    const next = applyUserCodingFieldChange(line, "sub_cost_code_id", "42");
    expect(next.coding_prefill_state).toBe("accepted");
  });
});

describe("nextPrefillState", () => {
  it("accept transitions prefilled to accepted", () => {
    expect(nextPrefillState("prefilled", "accept")).toBe("accepted");
    expect(nextPrefillState("accepted", "accept")).toBe("accepted");
    expect(nextPrefillState("changed", "accept")).toBe("changed");
    expect(nextPrefillState(undefined, "accept")).toBeUndefined();
  });

  it("user_edit transitions prefilled or accepted to changed", () => {
    expect(nextPrefillState("prefilled", "user_edit")).toBe("changed");
    expect(nextPrefillState("accepted", "user_edit")).toBe("changed");
    expect(nextPrefillState("changed", "user_edit")).toBe("changed");
    expect(nextPrefillState(undefined, "user_edit")).toBeUndefined();
  });
});

describe("confidence helpers", () => {
  it("parses ratio and percent confidence", () => {
    expect(parseConfidence(0.72)).toBe(0.72);
    expect(parseConfidence("72")).toBe(72);
    expect(formatSuggestionBadgeLabel(0.72)).toBe("Suggested 72%");
    expect(formatSuggestionBadgeLabel(72)).toBe("Suggested 72%");
    expect(isLowConfidence(0.55)).toBe(true);
    expect(isLowConfidence(0.72)).toBe(false);
  });

  it("r1-5 classifies low confidence from unrounded ratio (28/47 ≈ 59.57%)", () => {
    const conf = 28 / 47;
    expect(isLowConfidence(conf)).toBe(true);
    expect(suggestionBadgeClassName(conf)).toContain("coding-suggested-low");
  });
});

describe("suggestCoding", () => {
  beforeEach(() => {
    mockRawRequest.mockReset();
    resetSuggestCodingForTests();
  });

  it("returns suggestion data on success", async () => {
    mockRawRequest.mockResolvedValue({ data: sampleSuggestion() });
    const result = await suggestCoding({ vendor_public_id: "v-1" });
    expect(result?.source).toBe("vendor_history");
    expect(mockRawRequest).toHaveBeenCalledWith(
      "/api/v1/bill/coding/suggest",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("swallows 404 and 422", async () => {
    mockRawRequest.mockRejectedValueOnce(new ApiError(404, "Not found"));
    await expect(suggestCoding({ vendor_public_id: "v-1" })).resolves.toBeNull();
    mockRawRequest.mockRejectedValueOnce(new ApiError(422, "Bad"));
    await expect(suggestCoding({ vendor_public_id: "v-1" })).resolves.toBeNull();
  });

  it("swallows network TypeError", async () => {
    mockRawRequest.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(suggestCoding({ vendor_public_id: "v-1" })).resolves.toBeNull();
  });

  it("aborts stale in-flight requests", async () => {
    let firstSignal: AbortSignal | undefined;
    mockRawRequest.mockImplementation((_path, init: RequestInit) => {
      firstSignal = init.signal ?? undefined;
      return new Promise(() => {});
    });
    void suggestCoding({ vendor_public_id: "v-1" });
    mockRawRequest.mockResolvedValueOnce({ data: sampleSuggestion({ confidence: 0.9 }) });
    const second = await suggestCoding({ vendor_public_id: "v-2" });
    expect(second?.confidence).toBe(0.9);
    expect(firstSignal?.aborted).toBe(true);
  });
});
