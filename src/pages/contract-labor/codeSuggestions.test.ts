import { describe, expect, it } from "vitest";
import { resolveSuggestedCodes, subCostCodeLabel } from "./codeSuggestions";
import type { SubCostCode } from "../../types/api";

function scc(id: number, number: string, description: string | null = null): SubCostCode {
  return {
    id,
    public_id: `s${id}`,
    row_version: "rv",
    created_datetime: null,
    modified_datetime: null,
    number,
    name: `N${id}`,
    description,
    cost_code_id: 1,
    aliases: null,
  };
}

describe("resolveSuggestedCodes", () => {
  const byId = new Map([scc(1, "01"), scc(2, "02"), scc(3, "03")].map((s) => [s.id, s] as const));

  it("keeps API order and drops unknown + repeated ids", () => {
    expect(resolveSuggestedCodes([3, 99, 1, 3], byId).map((s) => s.id)).toEqual([3, 1]);
  });

  it("returns [] for undefined / empty / all-unknown", () => {
    expect(resolveSuggestedCodes(undefined, byId)).toEqual([]);
    expect(resolveSuggestedCodes([], byId)).toEqual([]);
    expect(resolveSuggestedCodes([42], byId)).toEqual([]);
  });
});

describe("subCostCodeLabel", () => {
  it("prefers description, falls back to name", () => {
    expect(subCostCodeLabel(scc(1, "01-100", "Framing"))).toBe("01-100 - Framing");
    expect(subCostCodeLabel(scc(2, "01-200", ""))).toBe("01-200 - N2");
  });
});
