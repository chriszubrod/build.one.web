import { describe, it, expect } from "vitest";
import { computeBillLine } from "../pages/bills/lineMath";
import {
  applyMarkup,
  computeAmount,
  fractionToPercent,
  percentToFraction,
  roundMoney,
} from "./money";

function billRow(
  fields: Partial<{
    quantity: string;
    rate: string;
    markup: string;
    amount: string;
    price: string;
  }>,
) {
  return {
    quantity: "",
    rate: "",
    markup: "",
    amount: "",
    price: "",
    ...fields,
  };
}

describe("parse / canonical inputs", () => {
  it.each([
    ["80.02", "1.25", 100.03],
    ["1.5e2", "1", 150],
    ["1e-7", "1", 0],
    ["", "5", 0],
    [0, "3", 0],
  ] as const)("computeAmount(%p, %p) cents-rounds correctly", (qty, rate, expected) => {
    expect(computeAmount(qty, rate)).toBe(expected);
  });

  it("treats empty operands as zero", () => {
    expect(computeAmount("", "")).toBe(0);
  });

  it("propagates a non-finite NUMBER instead of valuing it at zero (U-202)", () => {
    // These two assertions WERE the defect written as a contract.
    expect(Number.isNaN(computeAmount(Number.NaN, "1"))).toBe(true);
    expect(computeAmount("2", Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });

  it("handles negative operands and half-away-from-zero on negatives", () => {
    expect(computeAmount("-1", "1.005")).toBe(-1.01);
    expect(applyMarkup("-80.02", "0.25")).toBe(-100.03);
  });
});

describe("half away from zero (exact decimal multiply)", () => {
  it.each([
    ["1", "1.005", 1.01],
    ["-1", "1.005", -1.01],
    ["3", "33.335", 100.01],
  ])("computeAmount(%p, %p) = %p", (q, r, expected) => {
    expect(computeAmount(q, r)).toBe(expected);
  });

  it("uses the scale-up branch when s <= 2", () => {
    expect(computeAmount("100", "1")).toBe(100);
    expect(computeAmount("1", "100")).toBe(100);
  });
});

describe("headline float-lossy cases (U-192)", () => {
  function floatLossyPrice(q: string, r: string, markup: string): boolean {
    const amt = Number(q) * Number(r);
    const floatProduct = amt * (1 + Number(markup));
    const lossy = roundMoney(roundMoney(amt) * (1 + Number(markup)));
    const exact = applyMarkup(computeAmount(q, r), markup);
    return lossy !== exact && floatProduct !== exact;
  }

  it.each([
    ["1", "80.02", "0.25", "100.03"],
    ["2", "40.01", "0.25", "100.03"],
  ])(
    "applyMarkup after qty×rate: qty=%p rate=%p markup=%p → %p",
    (q, r, m, expected) => {
      expect(floatLossyPrice(q, r, m)).toBe(true);
      expect(applyMarkup(computeAmount(q, r), m)).toBe(Number(expected));
    },
  );

  it("applyMarkup on a preserved lump-sum amount avoids float markup multiply", () => {
    const lossy = roundMoney(80.02 * (1 + 0.25));
    expect(lossy).toBe(100.02);
    expect(applyMarkup("80.02", "0.25")).toBe(100.03);
  });
});

describe("percentToFraction", () => {
  it("shifts the decimal point instead of dividing in float", () => {
    expect(percentToFraction("25")).toBe("0.25");
    expect(percentToFraction("0.5")).toBe("0.005");
    expect(percentToFraction("-10")).toBe("-0.10");
  });
});

describe("fractionToPercent (U-195)", () => {
  it("converts common markup fractions without the float garbage it replaces", () => {
    // The spelling under replacement, pinned so the defect can't quietly return.
    expect(String(0.07 * 100)).toBe("7.000000000000001");
    expect(String(0.14 * 100)).toBe("14.000000000000002");

    expect(fractionToPercent(0.07)).toBe("7");
    expect(fractionToPercent(0.14)).toBe("14");
    expect(fractionToPercent(0.29)).toBe("29");
  });

  it.each([
    // DECIMAL(18,4) strings — trailing zeros normalize away
    ["0.0700", "7"],
    ["0.5000", "50"],
    ["0.0500", "5"],
    // sub-percent precision survives
    ["0.005", "0.5"],
    ["0.00125", "0.125"],
    // negatives and zero (never "-0", never "000")
    ["-0.10", "-10"],
    ["0", "0"],
    ["0.0000", "0"],
    ["-0.0000", "0"],
  ])("fractionToPercent(%p) → %p", (fraction, expected) => {
    expect(fractionToPercent(fraction)).toBe(expected);
  });

  it.each(["25", "0.5", "-10", "7", "14"])(
    "round-trip percentToFraction(%p)",
    (p) => {
      expect(fractionToPercent(percentToFraction(p))).toBe(p);
    },
  );
});

describe("roundMoney (re-exported behavior)", () => {
  it.each([
    [1.005, 1.01],
    [-1.005, -1.01],
  ])("rounds %p to %p", (input, expected) => {
    expect(roundMoney(input)).toBe(expected);
  });
});

describe("negative markup (P0 regression)", () => {
  it("applies signed (1 + markup), not 1 + |markup|", () => {
    expect(applyMarkup("80.02", "-0.25")).toBe(60.02);
    const line = computeBillLine(
      billRow({ quantity: "1", rate: "80.02", markup: "-0.25" }),
    );
    expect(line.price).toBe("60.02");
  });

  it("supports markup below -1 (negative multiplier)", () => {
    expect(applyMarkup("100", "-1.5")).toBe(-50);
  });

  it("composes signs: negative amount × negative multiplier", () => {
    expect(applyMarkup("-80.02", "-1.5")).toBe(40.01);
  });
});

describe("exponential markup (P1 regression)", () => {
  it("applyMarkup(100, '1e2') === 10100 without throwing", () => {
    expect(applyMarkup(100, "1e2")).toBe(10100);
  });

  it("parseDecimal normalizes negative intermediate scale (1e2 → mant 100, scale 0)", () => {
    expect(computeAmount("1e2", "1")).toBe(100);
  });
});

describe("MAX_SAFE_INTEGER guard", () => {
  it("degrades to float multiply + roundMoney instead of returning a wrong number", () => {
    const hugeQty = "1e154";
    const fromExact = computeAmount(hugeQty, "1");
    const floatFallback = roundMoney(Number(hugeQty) * 1);
    expect(fromExact).toBe(floatFallback);
    expect(Number.isFinite(fromExact)).toBe(true);
  });
});

describe("non-finite propagation (U-202)", () => {
  it("applyMarkup propagates NaN instead of returning 0", () => {
    expect(Number.isNaN(applyMarkup(Number.NaN, "0.25"))).toBe(true);
  });

  it("applyMarkup propagates positive and negative Infinity", () => {
    expect(applyMarkup(Number.POSITIVE_INFINITY, "0.25")).toBe(Number.POSITIVE_INFINITY);
    expect(applyMarkup(Number.NEGATIVE_INFINITY, "0.25")).toBe(Number.NEGATIVE_INFINITY);
  });

  it("computeAmount propagates negative Infinity", () => {
    expect(computeAmount(Number.NEGATIVE_INFINITY, "1")).toBe(Number.NEGATIVE_INFINITY);
  });

  it("fractionToPercent still maps non-finite to 0 (unchanged by U-202)", () => {
    expect(fractionToPercent(Number.NaN)).toBe("0");
    expect(fractionToPercent(Number.POSITIVE_INFINITY)).toBe("0");
  });

  it("percentToFraction maps NaN to 0 (post-change pin)", () => {
    expect(percentToFraction(Number.NaN)).toBe("0");
  });
});

describe("malformed decimal operands (U-192 round-2)", () => {
  const malformed = ["1e", "12abc", "1e2.5", "1e10000000"] as const;

  function legacyQtyRate(q: string, r: string): number {
    return roundMoney(Number(q) * Number(r));
  }

  it.each(malformed)("computeAmount(%p, 1) matches legacy float path", (q) => {
    expect(computeAmount(q, "1")).toBe(legacyQtyRate(q, "1"));
  });

  it.each(malformed)("computeAmount(1, %p) matches legacy float path", (r) => {
    expect(computeAmount("1", r)).toBe(legacyQtyRate("1", r));
  });

  it.each(malformed)(
    "applyMarkup(100, %p) matches legacy float path without throwing",
    (m) => {
      expect(applyMarkup(100, m)).toBe(roundMoney(100 * (1 + Number(m))));
    },
  );

  it.each(["1e", "12abc", "1e2.5"] as const)(
    "percentToFraction(%p) and fractionToPercent(%p) → 0 (legacy toNum/100 non-finite)",
    (bad) => {
      expect(percentToFraction(bad)).toBe("0");
      expect(fractionToPercent(bad)).toBe("0");
    },
  );

  it("computeBillLine blanks amount/price for qty 1e and 12abc (legacy NaN path)", () => {
    expect(
      computeBillLine(
        billRow({ quantity: "1e", rate: "80.02", markup: "0.25" }),
      ),
    ).toMatchObject({ amount: "", price: "" });
    expect(
      computeBillLine(
        billRow({ quantity: "12abc", rate: "1", markup: "0" }),
      ),
    ).toMatchObject({ amount: "", price: "" });
  });

  it("computeAmount(1e10000000, 1) returns promptly (no BigInt hang)", () => {
    const t0 = performance.now();
    const result = computeAmount("1e10000000", "1");
    expect(performance.now() - t0).toBeLessThan(500);
    expect(result).toBe(legacyQtyRate("1e10000000", "1"));
  });
});
