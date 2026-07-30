import { describe, it, expect } from "vitest";
import { computeBillLine, sumLineAmounts } from "./lineMath";

// A minimal BillLineMathFields row.
const row = (o: Partial<Record<"quantity" | "rate" | "markup" | "amount" | "price", string>>) => ({
  quantity: "",
  rate: "",
  markup: "",
  amount: "",
  price: "",
  ...o,
});

describe("computeBillLine", () => {
  it("derives amount = quantity * rate when both are present (unit×rate line)", () => {
    const r = computeBillLine(row({ quantity: "2", rate: "50" }));
    expect(r.amount).toBe("100.00");
    expect(r.price).toBe("100.00");
  });

  it("PRESERVES a stored amount when quantity and rate are blank (lump-sum / QBO account-based line)", () => {
    // U-167 regression: this previously recomputed 0 * 0 -> "" (silent money loss
    // on QBO account-based expense lines, which carry Amount with NULL qty/rate).
    const r = computeBillLine(row({ amount: "500.00" }));
    expect(r.amount).toBe("500.00");
  });

  it("applies markup to a preserved lump-sum amount", () => {
    const r = computeBillLine(row({ amount: "500.00", markup: "0.1" }));
    expect(r.amount).toBe("500.00");
    expect(r.price).toBe("550.00");
  });

  it("does not zero the amount when only one of quantity/rate is present", () => {
    const r = computeBillLine(row({ quantity: "3", amount: "500.00" }));
    expect(r.amount).toBe("500.00");
  });

  it("keeps a brand-new blank row blank (no spurious 0)", () => {
    const r = computeBillLine(row({}));
    expect(r.amount).toBe("");
    expect(r.price).toBe("");
  });

  it("re-derives a unit line from qty*rate even if the stored amount drifted", () => {
    const r = computeBillLine(row({ quantity: "2", rate: "50", amount: "999.99" }));
    expect(r.amount).toBe("100.00");
  });
});

describe("sumLineAmounts", () => {
  it("sums amounts, treating blank/null as 0", () => {
    expect(
      sumLineAmounts([{ amount: "100.00" }, { amount: "" }, { amount: "50.00" }, { amount: null }]),
    ).toBe(150);
  });

  it("includes preserved lump-sum amounts in the total after the U-167 fix", () => {
    const rows = [
      computeBillLine(row({ amount: "500.00" })), // lump-sum / QBO line
      computeBillLine(row({ quantity: "2", rate: "50" })), // unit×rate line
    ];
    expect(sumLineAmounts(rows)).toBe(600);
  });
});
