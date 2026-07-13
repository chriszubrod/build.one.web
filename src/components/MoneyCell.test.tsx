import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MoneyCell, { formatMoneyParts } from "./MoneyCell";

describe("formatMoneyParts", () => {
  it("formats negative accounting currency", () => {
    expect(formatMoneyParts("-8888.88")).toEqual({
      parenthesized: true,
      text: "($8,888.88)",
    });
  });

  it("formats small positive amounts", () => {
    expect(formatMoneyParts("1.11")).toEqual({
      parenthesized: false,
      text: "$1.11",
    });
  });

  it("formats large positive amounts with grouping", () => {
    expect(formatMoneyParts("10000.00")).toEqual({
      parenthesized: false,
      text: "$10,000.00",
    });
  });

  it("treats negative zero as parenthesized (regression: no double gutter)", () => {
    // "-0.00" => Number is -0, so `n < 0` is false, yet Intl accounting
    // formatting emits "($0.00)". The gutter must key off the rendered parens,
    // not the sign, or this row reserves two paren widths and misaligns.
    expect(formatMoneyParts("-0.00")).toEqual({
      parenthesized: true,
      text: "($0.00)",
    });
  });

  it("returns null for empty and null inputs", () => {
    expect(formatMoneyParts("")).toBeNull();
    expect(formatMoneyParts(null)).toBeNull();
  });
});

describe("MoneyCell", () => {
  it("renders negative amounts without a gutter span", () => {
    const markup = renderToStaticMarkup(<MoneyCell value="-8888.88" />);
    expect(markup).toContain("($8,888.88)");
    expect(markup).not.toContain("money-cell-gutter");
  });

  it("renders negative zero without a gutter span (regression)", () => {
    const markup = renderToStaticMarkup(<MoneyCell value="-0.00" />);
    expect(markup).toContain("($0.00)");
    expect(markup).not.toContain("money-cell-gutter");
  });

  it("renders positive amounts with a hidden gutter for decimal alignment", () => {
    const small = renderToStaticMarkup(<MoneyCell value="1.11" />);
    expect(small).toContain("money-cell-gutter");
    expect(small).toContain("money-cell");

    const large = renderToStaticMarkup(<MoneyCell value="10000.00" />);
    expect(large).toContain("money-cell-gutter");
    expect(large).toContain("money-cell");
  });
});
