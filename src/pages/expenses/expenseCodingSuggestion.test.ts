import { describe, it, expect } from "vitest";
import {
  expenseHasEmptyCodingField,
  expenseLineProjectSuggestionLabel,
  expenseLineSccSuggestionLabel,
  memoCodingBadgeClassName,
} from "./expenseCodingSuggestion";
import type { ExpenseCodingSuggestResponse, Project, SubCostCode } from "../../types/api";

const sccCatalog: SubCostCode[] = [
  { id: 21, public_id: "scc-21", name: "Siding Material", number: "21.00" } as SubCostCode,
];

const projectCatalog: Project[] = [
  { id: 144, public_id: "p-144", name: "Main Street", abbreviation: "HP2" } as Project,
];

function suggest(
  overrides: Partial<ExpenseCodingSuggestResponse> = {},
): ExpenseCodingSuggestResponse {
  return {
    status: "suggested",
    sub_cost_code: null,
    project: null,
    confidence: 0.9,
    ...overrides,
  };
}

describe("expenseCodingSuggestion", () => {
  it("expenseHasEmptyCodingField is true when SCC or project is empty", () => {
    expect(expenseHasEmptyCodingField([{ sub_cost_code_id: "", project_id: "1" }])).toBe(true);
    expect(expenseHasEmptyCodingField([{ sub_cost_code_id: "1", project_id: "" }])).toBe(true);
    expect(expenseHasEmptyCodingField([{ sub_cost_code_id: "1", project_id: "2" }])).toBe(false);
  });

  it("returns SCC suggestion label only on empty SCC when id is in catalog", () => {
    const line = { sub_cost_code_id: "" };
    const ok = suggest({
      sub_cost_code: {
        id: 21,
        source: "memo_shorthand",
        confidence: 0.9,
        reason: "memo match",
      },
    });
    expect(expenseLineSccSuggestionLabel(line, ok, sccCatalog)).toBe("21.00 — Siding Material");
    expect(expenseLineSccSuggestionLabel({ sub_cost_code_id: "21" }, ok, sccCatalog)).toBeNull();
    expect(
      expenseLineSccSuggestionLabel(
        line,
        suggest({ sub_cost_code: { id: 999, source: "memo_shorthand", confidence: 1, reason: "x" } }),
        sccCatalog,
      ),
    ).toBeNull();
  });

  it("returns project suggestion label only on empty project when id is in catalog", () => {
    const line = { project_id: "" };
    const ok = suggest({
      project: { id: 144, source: "memo_code", confidence: 0.88, reason: "HP2" },
    });
    expect(expenseLineProjectSuggestionLabel(line, ok, projectCatalog)).toBe("HP2 — Main Street");
    expect(expenseLineProjectSuggestionLabel({ project_id: "144" }, ok, projectCatalog)).toBeNull();
  });

  it("emphasizes high confidence badges at >= 0.85", () => {
    expect(memoCodingBadgeClassName(0.9)).toContain("coding-suggested-high");
    expect(memoCodingBadgeClassName(0.5)).not.toContain("coding-suggested-high");
    expect(memoCodingBadgeClassName(0.85)).toContain("coding-suggested-high");
    expect(memoCodingBadgeClassName(0.84)).not.toContain("coding-suggested-high");
  });
});
