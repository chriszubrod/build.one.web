import { describe, it, expect } from "vitest";
import { isCostPlusLabel } from "./projectFlags";

describe("isCostPlusLabel", () => {
  it("renders Yes when the project is cost-plus", () => {
    expect(isCostPlusLabel({ is_cost_plus: true })).toBe("Yes");
  });

  it("renders No when the project is not cost-plus", () => {
    expect(isCostPlusLabel({ is_cost_plus: false })).toBe("No");
  });

  it("renders Unknown when the api could not project the column (null)", () => {
    expect(isCostPlusLabel({ is_cost_plus: null })).toBe("Unknown");
  });

  it("renders Unknown when the field is absent from a pre-U-099 cached payload", () => {
    expect(isCostPlusLabel({})).toBe("Unknown");
  });
});
