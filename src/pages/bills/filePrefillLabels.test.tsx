import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  filePrefillLabel,
  headerFieldMatchesPrediction,
  line1FieldMatchesPrediction,
} from "./filePrefillLabels";
import type { BillIntakePrediction } from "../../types/api";

describe("filePrefillLabel", () => {
  it("returns null unless state is prefilled", () => {
    expect(filePrefillLabel({}, "bill_number", false)).toBeNull();
    expect(
      filePrefillLabel({ bill_number: { state: "changed" } }, "bill_number", false),
    ).toBeNull();
  });

  it("renders header badge when prefilled", () => {
    const node = filePrefillLabel({ bill_number: { state: "prefilled" } }, "bill_number", false);
    const html = renderToStaticMarkup(createElement("div", null, node));
    expect(html).toContain("From file");
  });
});

describe("billEdit prefill match helpers", () => {
  const prediction: BillIntakePrediction = {
    status: "ok",
    intake_source: "list_drop",
    vendor: { public_id: "v-1", name: "Acme" },
    bill_number: "INV-9",
    bill_date: "2026-03-01",
    total_amount: "150.00",
    description: "Materials",
    sub_cost_code: null,
    project: null,
    header_confidence: null,
    coding_confidence: null,
  };

  const form = {
    is_draft: true,
    vendor_public_id: "v-1",
    bill_number: "INV-9",
    bill_date: "2026-03-01",
  };

  it("matches header fields when equal", () => {
    expect(headerFieldMatchesPrediction(prediction, form, "vendor_public_id")).toBe(true);
    expect(headerFieldMatchesPrediction(prediction, form, "bill_number")).toBe(true);
    expect(headerFieldMatchesPrediction(prediction, form, "bill_date")).toBe(true);
  });

  it("fails match after user edits", () => {
    expect(
      headerFieldMatchesPrediction(prediction, { ...form, bill_number: "X" }, "bill_number"),
    ).toBe(false);
  });

  it("matches line-1 description when total_amount is null", () => {
    const noTotal = { ...prediction, total_amount: null };
    const line = { description: "Materials", rate: "", amount: "" };
    expect(line1FieldMatchesPrediction(noTotal, line, "description")).toBe(true);
    expect(line1FieldMatchesPrediction(noTotal, line, "rate")).toBe(false);
    expect(line1FieldMatchesPrediction(noTotal, line, "amount")).toBe(false);
  });

  it("rate label only when rate equals predicted total, not via amount", () => {
    const lineQty2 = { description: "Materials", rate: "75.00", amount: "150.00" };
    expect(line1FieldMatchesPrediction(prediction, lineQty2, "rate")).toBe(false);
    expect(line1FieldMatchesPrediction(prediction, lineQty2, "amount")).toBe(true);
    const lineRateMatch = { description: "Materials", rate: "150.00", amount: "300.00" };
    expect(line1FieldMatchesPrediction(prediction, lineRateMatch, "rate")).toBe(true);
    expect(line1FieldMatchesPrediction(prediction, lineRateMatch, "amount")).toBe(false);
  });
});
