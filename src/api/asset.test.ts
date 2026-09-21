import { describe, it, expect } from "vitest";
import { fmtAssetMoney, displayNetBookValue } from "./asset";

describe("asset money helpers", () => {
  it('fmtAssetMoney renders "0" as $0.00', () => {
    expect(fmtAssetMoney("0")).toBe("$0.00");
  });

  it("displayNetBookValue sums QBO cost and accum dep for display", () => {
    expect(displayNetBookValue("50000.00", "-10000.00")).toBe("40000.00");
  });
});
