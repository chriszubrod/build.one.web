import { describe, it, expect } from "vitest";
import { applyMarkup, computeAmount, roundMoney } from "../../shared/money";
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

  it("DEFECT (a): half-cent amount rounds up via roundMoney, not mis-rounding toFixed(2)", () => {
    // Pre-fix: amount.toFixed(2) returned '1.00' for rate 1.005 (double is 1.004999…).
    const r = computeBillLine(row({ quantity: "1", rate: "1.005" }));
    expect(r.amount).toBe("1.01");
  });

  it("rounds negative half-cent amount half away from zero", () => {
    const r = computeBillLine(row({ quantity: "1", rate: "-1.005" }));
    expect(r.amount).toBe("-1.01");
  });

  it("DEFECT (b): price derives from rounded amount so display stays consistent", () => {
    // Pre-fix: price was '2.01' because it used un-rounded amount 1.004 * (1 + 1).
    const r = computeBillLine(row({ quantity: "1", rate: "1.004", markup: "1" }));
    expect(r.amount).toBe("1.00");
    expect(r.price).toBe("2.00");
  });

  // Explicit expected values, NOT `roundMoney(amount * (1 + markup)) === price`
  // — that form re-runs computeBillLine's own formula, so it would pass even if
  // roundMoney were entirely wrong. These are the literal rendered strings.
  // The first row is a deliberate whole-cent CONTROL: it passes pre-fix too,
  // which is the point (it pins that the common case did not move). The other
  // three each fail against the pre-fix code.
  it.each([
    ["2", "50", "0", "100.00", "100.00"],
    ["1", "1.004", "1", "1.00", "2.00"],
    ["3", "33.335", "0.1", "100.01", "110.01"],
    ["1", "100.005", "0", "100.01", "100.01"],
  ])("qty %p x rate %p @ markup %p renders amount %p / price %p", (quantity, rate, markup, amount, price) => {
    const r = computeBillLine(row({ quantity, rate, markup }));
    expect(r.amount).toBe(amount);
    expect(r.price).toBe(price);
  });

  it("amount that rounds to zero cents renders empty string (approved gate on rounded value)", () => {
    const r = computeBillLine(row({ amount: "0.004" }));
    expect(r.amount).toBe("");
    expect(r.price).toBe("");
  });

  it("keeps amount and price non-empty at extreme magnitude (gate consistency)", () => {
    // Pre-fix: price was '' while amount rendered as '1e+306'.
    const r = computeBillLine(row({ amount: "1e306", markup: "1" }));
    expect(r.amount).not.toBe("");
    expect(r.price).not.toBe("");
  });

  it("exact decimal markup: qty 1 × rate 80.02 @ 25% markup → price 100.03 (not float 100.02)", () => {
    const floatProduct = Number("1") * Number("80.02") * (1 + Number("0.25"));
    const lossy = roundMoney(roundMoney(Number("1") * Number("80.02")) * (1 + Number("0.25")));
    expect(floatProduct).toBe(100.02499999999999);
    expect(lossy).toBe(100.02);

    const r = computeBillLine(row({ quantity: "1", rate: "80.02", markup: "0.25" }));
    expect(r.amount).toBe("80.02");
    expect(r.price).toBe("100.03");
  });

  it.each([
    ["2", "40.01", "0.25", "80.02", "100.03"],
    ["80.02", "", "0.25", "80.02", "100.03"],
  ])(
    "float-lossy sibling qty=%p rate=%p markup=%p → amount %p / price %p",
    (quantity, rate, markup, amount, price) => {
      if (rate !== "") {
        const lossy = roundMoney(
          roundMoney(Number(quantity) * Number(rate)) * (1 + Number(markup)),
        );
        const exact = applyMarkup(computeAmount(quantity, rate), markup);
        expect(lossy).not.toBe(exact);
        const r = computeBillLine(row({ quantity, rate, markup }));
        expect(r.amount).toBe(amount);
        expect(r.price).toBe(price);
      } else {
        const lossy = roundMoney(Number(amount) * (1 + Number(markup)));
        expect(lossy).toBe(100.02);
        const r = computeBillLine(row({ amount: quantity, markup }));
        expect(r.amount).toBe(amount);
        expect(r.price).toBe(price);
      }
    },
  );
});

describe("roundMoney", () => {
  // Half-cent cases are the whole point: toFixed(2) returns "1.00" for 1.005
  // and "2.67" for 2.675, because the nearest double sits just BELOW the half.
  it.each([
    [1.005, 1.01],
    [-1.005, -1.01],
    [2.675, 2.68],
    [100.005, 100.01],
    [1.25, 1.25],
    [0, 0],
    [1e-7, 0],
  ])("rounds %p to %p (half away from zero)", (input, expected) => {
    expect(roundMoney(input)).toBe(expected);
  });

  // The three below are NOT table rows: each pins a distinct guard, and the
  // comment recording what the unguarded version returned is the point.
  it("passes NaN through", () => {
    expect(Number.isNaN(roundMoney(Number.NaN))).toBe(true);
  });

  it("leaves values above the 2^49 cent-shift cutoff unchanged (degrades to pre-fix toFixed)", () => {
    // Unguarded version returned 90071992547409.95 for the positive case.
    expect(roundMoney(90071992547409.97)).toBe(90071992547409.97);
    expect(roundMoney(-90071992547409.97)).toBe(-90071992547409.97);
  });

  it("degrades to the pre-fix answer between 2^49 and MAX_SAFE_INTEGER (pins the cutoff move)", () => {
    // Deliberate trade: the OLD `> MAX_SAFE_INTEGER` cutoff would have rounded
    // this to 6000000000000.01, since its shift (6.000000000000005e14) is well
    // under MAX_SAFE_INTEGER. We now pass it through instead, because a shift
    // this large can no longer be trusted to land on the right side of .5.
    expect(roundMoney(6000000000000.005)).toBe(6000000000000.005);
  });

  it("does not round UP a sub-half value whose cent shift lands on a spurious .5", () => {
    // At 2^50 the shifted double's ULP is 0.25, so 1125899906842624.4 snaps to
    // …24.5 and Math.round would take it up to …26.25. The cutoff sends this
    // down the passthrough path instead, so computeBillLine's toFixed(2) then
    // renders the correct "11258999068426.24".
    expect(roundMoney(11258999068426.244)).toBe(11258999068426.244);
    expect(computeBillLine(row({ amount: "11258999068426.244" })).amount).toBe("11258999068426.24");
  });

  it("does not return NaN when the cent shift would overflow to Infinity", () => {
    // Unguarded version returned NaN.
    expect(roundMoney(1e307)).toBe(1e307);
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
