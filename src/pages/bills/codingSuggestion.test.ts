import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "../../api/client";
import {
  applySuggestionToLines,
  applyUserCodingFieldChange,
  billLevelBudgetChip,
  budgetChip,
  buildCodingSuggestInputKey,
  centsToDecimal,
  codingSuggestAmountFromLines,
  coveredLinesMatchSuggestedScc,
  decimalToCents,
  nextPrefillState,
  parseConfidence,
  serializeCodingSuggestKey,
  formatSuggestionBadgeLabel,
  isLowConfidence,
  lineShowsProjectSuggestionMarker,
  projectHintFromLines,
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
    budget_check: null,
    budget_remaining: null,
    ...overrides,
  };
}

type DraftLine = LineCodingFields & { uid: string; amount?: string };

function emptyLine(uid: string): DraftLine {
  return { uid, sub_cost_code_id: "", project_public_id: "" };
}

const catalog = [{ id: 42, public_id: "scc-pub" }];

describe("applySuggestionToLines", () => {
  it("fills only empty SCC cells (never project)", () => {
    const lines = [
      emptyLine("a"),
      { ...emptyLine("b"), sub_cost_code_id: "99", project_public_id: "" },
      { ...emptyLine("c"), sub_cost_code_id: "", project_public_id: "existing" },
    ];
    const out = applySuggestionToLines(lines, sampleSuggestion(), catalog);
    expect(out[0].sub_cost_code_id).toBe("42");
    expect(out[0].project_public_id).toBe("");
    expect(out[0].coding_prefill_state).toBe("prefilled");
    expect(out[1].sub_cost_code_id).toBe("99");
    expect(out[1].project_public_id).toBe("");
    expect(out[1].coding_prefill_state).toBeUndefined();
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
    expect(out[0].project_public_id).toBe("");
    expect(out[0].coding_prefill_state).toBeUndefined();
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
    expect(out[2].project_public_id).toBe("");
    expect(out[2].coding_prefill_state).toBe("prefilled");
  });

  it("r3-2 never prefills project_public_id from history suggestion", () => {
    const lines: DraftLine[] = [emptyLine("a")];
    const out = applySuggestionToLines(lines, sampleSuggestion(), catalog);
    expect(out[0].project_public_id).toBe("");
  });

  it("llm source prefills project on empty untouched lines only", () => {
    const lines: DraftLine[] = [
      emptyLine("a"),
      { ...emptyLine("b"), project_public_id: "user-proj" },
      { ...emptyLine("c"), coding_project_touched: true },
    ];
    const out = applySuggestionToLines(
      lines,
      sampleSuggestion({ source: "llm", project_public_id: "p-llm" }),
      catalog,
    );
    expect(out[0].project_public_id).toBe("p-llm");
    expect(out[0].coding_suggested_project_public_id).toBe("p-llm");
    expect(out[0].coding_prefill_state).toBe("prefilled");
    expect(out[1].project_public_id).toBe("user-proj");
    expect(out[2].project_public_id).toBe("");
  });

  it("llm SCC auto-fills empty untouched line with AI source on badge fields", () => {
    const lines: DraftLine[] = [emptyLine("a")];
    const out = applySuggestionToLines(
      lines,
      sampleSuggestion({ source: "llm", confidence: 0.81 }),
      catalog,
    );
    expect(out[0].sub_cost_code_id).toBe("42");
    expect(out[0].coding_suggestion_source).toBe("llm");
    expect(formatSuggestionBadgeLabel(out[0].coding_suggestion_confidence ?? null, "llm")).toBe(
      "AI 81%",
    );
  });

  it("llm never overwrites touched line or set SCC", () => {
    const lines: DraftLine[] = [
      { ...emptyLine("a"), coding_scc_touched: true },
      { ...emptyLine("b"), sub_cost_code_id: "7" },
    ];
    const out = applySuggestionToLines(
      lines,
      sampleSuggestion({ source: "llm" }),
      catalog,
    );
    expect(out[0].sub_cost_code_id).toBe("");
    expect(out[1].sub_cost_code_id).toBe("7");
  });

  it("web-r3 an accepted line is never replaced by a later llm result", () => {
    const accepted: DraftLine = {
      ...emptyLine("a"),
      sub_cost_code_id: "42",
      coding_suggested_sub_cost_code_id: "42",
      coding_prefill_state: "accepted",
      coding_suggestion_source: "vendor_history",
      coding_suggestion_reason: "history",
    };
    const llmCatalog = [...catalog, { id: 99, public_id: "scc-llm" }];
    const out = applySuggestionToLines(
      [accepted],
      sampleSuggestion({
        source: "llm",
        sub_cost_code_public_id: "scc-llm",
        project_public_id: "p-llm",
        reason: "text",
      }),
      llmCatalog,
    );
    // The project fill is allowed (empty cell) but must not touch the SCC or its badge.
    expect(out[0].sub_cost_code_id).toBe("42");
    expect(out[0].coding_prefill_state).toBe("accepted");
    expect(out[0].coding_suggestion_source).toBe("vendor_history");
    expect(out[0].coding_suggestion_reason).toBe("history");
    expect(out[0].project_public_id).toBe("p-llm");
  });

  it("web-r3 a project-only llm fill leaves the SCC badge state alone and marks the project", () => {
    const userScc: DraftLine = { ...emptyLine("a"), sub_cost_code_id: "7" };
    const out = applySuggestionToLines(
      [userScc],
      sampleSuggestion({ source: "llm", project_public_id: "p-llm" }),
      catalog,
    );
    expect(out[0].project_public_id).toBe("p-llm");
    expect(out[0].coding_prefill_state).toBeUndefined();
    expect(out[0].coding_suggestion_source).toBeUndefined();
    expect(out[0].coding_suggestion_confidence).toBeUndefined();
    expect(lineShowsProjectSuggestionMarker(out[0])).toBe(true);
    expect(lineShowsProjectSuggestionMarker({ ...out[0], coding_project_touched: true })).toBe(false);
    expect(lineShowsProjectSuggestionMarker({ ...out[0], project_public_id: "other" })).toBe(false);
  });

  it("web-r3 a history result never replaces a prefilled SCC", () => {
    const prefilled: DraftLine = {
      ...emptyLine("a"),
      sub_cost_code_id: "42",
      coding_suggested_sub_cost_code_id: "42",
      coding_prefill_state: "prefilled",
      coding_suggestion_source: "llm",
    };
    const historyCatalog = [...catalog, { id: 99, public_id: "scc-hist" }];
    const out = applySuggestionToLines(
      [prefilled],
      sampleSuggestion({ sub_cost_code_public_id: "scc-hist" }),
      historyCatalog,
    );
    expect(out).toEqual([prefilled]);
  });

  it("web-r3 an llm result refreshes a prefilled untouched SCC", () => {
    const prefilled: DraftLine = {
      ...emptyLine("a"),
      sub_cost_code_id: "42",
      coding_suggested_sub_cost_code_id: "42",
      coding_prefill_state: "prefilled",
      coding_suggestion_source: "vendor_history",
    };
    const llmCatalog = [...catalog, { id: 99, public_id: "scc-llm" }];
    const out = applySuggestionToLines(
      [prefilled],
      sampleSuggestion({ source: "llm", sub_cost_code_public_id: "scc-llm" }),
      llmCatalog,
    );
    expect(out[0].sub_cost_code_id).toBe("99");
    expect(out[0].coding_prefill_state).toBe("prefilled");
    expect(out[0].coding_suggestion_source).toBe("llm");
  });

  it("web-r4 an llm refresh that moves the project also refreshes its SCC", () => {
    const llmCatalog = [...catalog, { id: 99, public_id: "scc-2" }];
    const first = applySuggestionToLines(
      [emptyLine("a")],
      sampleSuggestion({ source: "llm", project_public_id: "p-1", reason: "first" }),
      llmCatalog,
    );
    expect(first[0]).toMatchObject({ project_public_id: "p-1", sub_cost_code_id: "42" });
    const out = applySuggestionToLines(
      first,
      sampleSuggestion({
        source: "llm",
        project_public_id: "p-2",
        sub_cost_code_public_id: "scc-2",
        reason: "second",
      }),
      llmCatalog,
    );
    expect(out[0]).toMatchObject({
      project_public_id: "p-2",
      sub_cost_code_id: "99",
      coding_prefill_state: "prefilled",
      coding_suggestion_reason: "second",
    });
  });

  it("web-r4 an llm refresh fills an empty SCC on the project it moves to", () => {
    const llmCatalog = [...catalog, { id: 99, public_id: "scc-2" }];
    const first = applySuggestionToLines(
      [emptyLine("a")],
      sampleSuggestion({ source: "llm", project_public_id: "p-1", sub_cost_code_public_id: "unmapped" }),
      llmCatalog,
    );
    expect(first[0]).toMatchObject({ project_public_id: "p-1", sub_cost_code_id: "" });
    const out = applySuggestionToLines(
      first,
      sampleSuggestion({ source: "llm", project_public_id: "p-2", sub_cost_code_public_id: "scc-2" }),
      llmCatalog,
    );
    expect(out[0]).toMatchObject({ project_public_id: "p-2", sub_cost_code_id: "99" });
  });

  it("web-r4 an llm refresh never moves the project away from its unrefreshable SCC", () => {
    const first = applySuggestionToLines(
      [emptyLine("a")],
      sampleSuggestion({ source: "llm", project_public_id: "p-1" }),
      catalog,
    );
    const out = applySuggestionToLines(
      first,
      sampleSuggestion({ source: "llm", project_public_id: "p-2", sub_cost_code_public_id: "unmapped" }),
      catalog,
    );
    expect(out).toBe(first);
  });

  it('r6-5 applySuggestionToLines no-ops for source "none"', () => {
    const lines: DraftLine[] = [emptyLine("a")];
    const noneSuggestion = sampleSuggestion({ source: "none" });
    expect(applySuggestionToLines(lines, noneSuggestion, catalog)).toBe(lines);
  });

  it("r6-5 applySuggestionToLines no-ops for null suggestion", () => {
    const lines: DraftLine[] = [emptyLine("a")];
    expect(applySuggestionToLines(lines, null, catalog)).toBe(lines);
  });

});

describe("projectHintFromLines", () => {
  it("r6-4 returns shared project from every non-empty accessible line", () => {
    expect(
      projectHintFromLines([
        { project_public_id: "p-1", unresolved_project_id: undefined },
        { project_public_id: "", unresolved_project_id: undefined },
        { project_public_id: "p-1", unresolved_project_id: undefined },
      ]),
    ).toBe("p-1");
  });

  it("r6-4 returns undefined when non-empty lines disagree", () => {
    expect(
      projectHintFromLines([
        { project_public_id: "p-1", unresolved_project_id: undefined },
        { project_public_id: "p-2", unresolved_project_id: undefined },
      ]),
    ).toBeUndefined();
  });

  it("r6-4 returns undefined when only inaccessible projects are set", () => {
    expect(
      projectHintFromLines([{ project_public_id: "p-1", unresolved_project_id: 144 }]),
    ).toBeUndefined();
  });
});

describe("applyUserCodingFieldChange (r2-P)", () => {
  it("r4-2 project change does not transition prefilled state when project was not suggested", () => {
    const line: LineCodingFields = {
      sub_cost_code_id: "42",
      project_public_id: "",
      coding_prefill_state: "prefilled",
      coding_suggested_sub_cost_code_id: "42",
    };
    const next = applyUserCodingFieldChange(line, "project_public_id", "p-1");
    expect(next.coding_prefill_state).toBe("prefilled");
    expect(next.project_public_id).toBe("p-1");
    expect(next.coding_project_touched).toBe(true);
    const accepted: LineCodingFields = {
      sub_cost_code_id: "42",
      project_public_id: "",
      coding_prefill_state: "accepted",
    };
    expect(applyUserCodingFieldChange(accepted, "project_public_id", "p-1").coding_prefill_state).toBe(
      "accepted",
    );
  });

  it("llm suggested project edit transitions prefilled to changed", () => {
    const line: LineCodingFields = {
      sub_cost_code_id: "42",
      project_public_id: "p-llm",
      coding_prefill_state: "prefilled",
      coding_suggested_sub_cost_code_id: "42",
      coding_suggested_project_public_id: "p-llm",
      coding_suggestion_source: "llm",
    };
    const next = applyUserCodingFieldChange(line, "project_public_id", "p-other");
    expect(next.coding_prefill_state).toBe("changed");
    expect(next.coding_project_touched).toBe(true);
  });

  it("web-r4 editing an llm project filled beside a history SCC leaves the SCC state", () => {
    for (const state of ["prefilled", "accepted"] as const) {
      const line: LineCodingFields = {
        sub_cost_code_id: "42",
        project_public_id: "p-llm",
        coding_prefill_state: state,
        coding_suggested_sub_cost_code_id: "42",
        coding_suggested_project_public_id: "p-llm",
        coding_suggestion_source: "vendor_history",
      };
      const next = applyUserCodingFieldChange(line, "project_public_id", "p-9");
      expect(next.coding_prefill_state).toBe(state);
      expect(lineShowsProjectSuggestionMarker(next)).toBe(false);
    }
  });

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

describe("billLevelBudgetChip", () => {
  function key(vendor: string, memo: string, project: string, amount: string) {
    return serializeCodingSuggestKey(
      buildCodingSuggestInputKey({
        vendor_public_id: vendor,
        memo,
        project_public_id: project,
        amount,
      }),
    );
  }

  it("r5-6 shows chip only when stored key, hint project, and amount align", () => {
    const k = key("v-1", "memo", "p-1", "100.00");
    const coveredLines: LineCodingFields[] = [
      {
        sub_cost_code_id: "42",
        project_public_id: "p-1",
        coding_prefill_state: "prefilled",
        coding_suggested_sub_cost_code_id: "42",
      },
    ];
    const stored = {
      key: k,
      budget_check: "fits" as const,
      budget_remaining: "0",
      project_public_id: "p-1",
      suggested_scc_option_id: "42",
    };
    expect(billLevelBudgetChip(stored, k, "p-1", "100.00", coveredLines)?.label).toBe(
      "Within budget",
    );
    expect(
      billLevelBudgetChip(stored, key("v-1", "other", "p-1", "100.00"), "p-1", "100.00", coveredLines),
    ).toBeNull();
    expect(billLevelBudgetChip(stored, k, undefined, "100.00", coveredLines)).toBeNull();
    expect(billLevelBudgetChip(stored, k, "p-2", "100.00", coveredLines)).toBeNull();
    expect(billLevelBudgetChip(stored, k, "p-1", undefined, coveredLines)).toBeNull();
  });

  it("r6-3 hides chip when a covered line holds a different SCC than the stored response", () => {
    const k = key("v-1", "memo", "p-2", "100.00");
    const stored = {
      key: k,
      budget_check: "fits" as const,
      budget_remaining: "0",
      project_public_id: "p-2",
      suggested_scc_option_id: "20",
    };
    const linesMismatch: LineCodingFields[] = [
      {
        sub_cost_code_id: "10",
        project_public_id: "p-2",
        coding_prefill_state: "prefilled",
        coding_suggested_sub_cost_code_id: "10",
      },
    ];
    expect(billLevelBudgetChip(stored, k, "p-2", "100.00", linesMismatch)).toBeNull();
    expect(
      coveredLinesMatchSuggestedScc(linesMismatch, "p-2", "20"),
    ).toBe(false);

    const linesMatch: LineCodingFields[] = [
      {
        sub_cost_code_id: "20",
        project_public_id: "p-2",
        coding_prefill_state: "prefilled",
        coding_suggested_sub_cost_code_id: "20",
      },
    ];
    expect(billLevelBudgetChip(stored, k, "p-2", "100.00", linesMatch)?.label).toBe(
      "Within budget",
    );
  });
});

describe("budgetChip", () => {
  it("r1-4 formats large over amounts without float corruption", () => {
    expect(budgetChip("over", "-9999999999999999.99")?.label).toBe(
      "Over by $9,999,999,999,999,999.99",
    );
  });

  it("maps every budget_check value including negative remaining", () => {
    expect(budgetChip("fits", "100.00")).toEqual({
      label: "Within budget",
      className: "status-badge coding-budget-fits",
    });
    expect(budgetChip("tight", "50.25")?.label).toBe("Tight: $50.25 left");
    expect(budgetChip("tight", "50.25")?.className).toContain("coding-budget-tight");
    expect(budgetChip("over", "-75.00")?.label).toBe("Over by $75.00");
    expect(budgetChip("over", "-75.00")?.className).toContain("coding-budget-over");
    expect(budgetChip("unbudgeted", null)?.label).toBe("No budget line");
    expect(budgetChip("no_budget", null)?.label).toBe("No active budget");
    expect(budgetChip("no_project", "0")).toBeNull();
    expect(budgetChip(null, "0")).toBeNull();
    expect(budgetChip(undefined, "0")).toBeNull();
    expect(budgetChip("over", null)).toBeNull();
  });
});

describe("codingSuggestAmountFromLines", () => {
  it("sums amounts for SCC-eligible lines and omits zero", () => {
    type Row = LineCodingFields & { amount: string };
    const lines: Row[] = [
      { sub_cost_code_id: "", project_public_id: "", amount: "100.00" },
      { sub_cost_code_id: "", project_public_id: "p-1", amount: "50.00" },
      { sub_cost_code_id: "9", project_public_id: "", amount: "999.00" },
      { sub_cost_code_id: "", project_public_id: "p-2", amount: "25.00" },
    ];
    expect(codingSuggestAmountFromLines(lines, "p-1")).toBe("50.00");
    expect(codingSuggestAmountFromLines([{ sub_cost_code_id: "", project_public_id: "", amount: "" }], undefined)).toBeUndefined();
  });

  it("r3-3 omits suggest amount without a project hint", () => {
    type Row = LineCodingFields & { amount: string };
    const lines: Row[] = [
      { sub_cost_code_id: "", project_public_id: "", amount: "100.00" },
    ];
    expect(codingSuggestAmountFromLines(lines, undefined)).toBeUndefined();
  });

  it("r1-3 omits amount when empty-SCC lines disagree on project without hint", () => {
    type Row = LineCodingFields & { amount: string };
    const lines: Row[] = [
      { sub_cost_code_id: "", project_public_id: "p-1", amount: "100.00" },
      { sub_cost_code_id: "", project_public_id: "p-2", amount: "200.00" },
      { sub_cost_code_id: "", project_public_id: "", amount: "10.00" },
    ];
    expect(codingSuggestAmountFromLines(lines, undefined)).toBeUndefined();
  });

  it("r2-2 omits suggest amount when an eligible line has invalid non-blank amount", () => {
    type Row = LineCodingFields & { amount: string };
    const lines: Row[] = [
      { sub_cost_code_id: "", project_public_id: "p-1", amount: "100.00" },
      { sub_cost_code_id: "", project_public_id: "p-1", amount: "invalid" },
    ];
    expect(codingSuggestAmountFromLines(lines, "p-1")).toBeUndefined();
  });

  it("r1-4 sums exact cents and omits zero total", () => {
    expect(
      codingSuggestAmountFromLines(
        [
          { sub_cost_code_id: "", project_public_id: "p-1", amount: "10.10" },
          { sub_cost_code_id: "", project_public_id: "p-1", amount: "20.20" },
        ],
        "p-1",
      ),
    ).toBe("30.30");
    expect(decimalToCents("70368744177663.98")! + decimalToCents("0.01")!).toBe(
      decimalToCents("70368744177663.99")!,
    );
    expect(
      codingSuggestAmountFromLines(
        [
          { sub_cost_code_id: "", project_public_id: "p-1", amount: "10.10" },
          { sub_cost_code_id: "", project_public_id: "p-1", amount: "20.20" },
        ],
        "p-1",
      ),
    ).not.toBe("-0.00");
    expect(centsToDecimal(0n)).toBe("0.00");
  });

  it("r6-2 omits suggest amount when eligible lines net to zero or negative cents", () => {
    type Row = LineCodingFields & { amount: string };
    const lines: Row[] = [
      { sub_cost_code_id: "", project_public_id: "p-1", amount: "50.00" },
      { sub_cost_code_id: "", project_public_id: "p-1", amount: "-100.00" },
    ];
    expect(codingSuggestAmountFromLines(lines, "p-1")).toBeUndefined();
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

  it("includes amount in the request body only when provided", async () => {
    mockRawRequest.mockResolvedValue({ data: sampleSuggestion() });
    await suggestCoding({ vendor_public_id: "v-1" });
    const bodyWithout = JSON.parse(
      (mockRawRequest.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(bodyWithout.amount).toBeUndefined();

    mockRawRequest.mockClear();
    await suggestCoding({ vendor_public_id: "v-1", amount: "250.00" });
    const bodyWith = JSON.parse(
      (mockRawRequest.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(bodyWith.amount).toBe("250.00");
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
