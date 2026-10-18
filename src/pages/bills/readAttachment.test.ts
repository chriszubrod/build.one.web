import { describe, it, expect } from "vitest";
import type { ReadAttachmentResult } from "../../types/api";
import { applyReadAttachmentResult, pullBillPdfFromLocationState } from "./readAttachment";
import { createEmptyHeaderPrefill, createEmptyLine1Prefill } from "./headerPrefill";

const vendors = [{ public_id: "v-1", name: "Acme" }];
const sccCatalog = [{ id: 10, public_id: "scc-pub", number: "01", name: "Ten" }];

function emptyFields(): ReadAttachmentResult["fields"] {
  return {
    vendor: { value: null, extracted_name: null, confidence: null },
    bill_number: { value: null, confidence: null },
    bill_date: { value: null, confidence: null },
    total_amount: { value: null, confidence: null },
    description: { value: null, confidence: null },
  };
}

function baseLine() {
  return {
    uid: "li-1",
    project_public_id: "",
    sub_cost_code_id: "",
    description: "",
    quantity: "1",
    rate: "",
    amount: "",
    markup: "",
    price: "",
    is_billable: true,
  };
}

describe("pullBillPdfFromLocationState", () => {
  it("returns a PDF File once from router state", () => {
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    expect(pullBillPdfFromLocationState({ billPdfFile: file })).toBe(file);
    expect(pullBillPdfFromLocationState(null)).toBeNull();
    expect(pullBillPdfFromLocationState({ billPdfFile: new File(["x"], "b", { type: "text/plain" }) })).toBeNull();
  });
});

describe("applyReadAttachmentResult", () => {
  it("ok fills vendor, header, line amount, and coding", () => {
    const result: ReadAttachmentResult = {
      status: "ok",
      message: null,
      fields: {
        ...emptyFields(),
        vendor: { value: { public_id: "v-1", name: "Acme" }, extracted_name: "Acme", confidence: "0.9" },
        bill_number: { value: "B-9", confidence: "0.8" },
        bill_date: { value: "2026-02-01", confidence: "0.8" },
        total_amount: { value: "250.00", confidence: "0.7" },
        description: { value: "Materials", confidence: "0.6" },
      },
      coding: {
        project_public_id: "p-1",
        project_name: "P1",
        sub_cost_code_public_id: "scc-pub",
        sub_cost_code_number: "01",
        sub_cost_code_name: "Ten",
        source: "llm",
        reason: "from invoice",
        confidence: 0.8,
        model_version: "v1",
        budget_check: null,
        budget_remaining: null,
      },
      model: "test",
    };

    const outcome = applyReadAttachmentResult({
      result,
      form: {
        vendor_public_id: "",
        payment_term_public_id: "",
        bill_date: "",
        bill_number: "",
        memo: "",
      },
      headerPrefill: createEmptyHeaderPrefill(),
      line1Prefill: createEmptyLine1Prefill(),
      lines: [baseLine()],
      vendors,
      sccCatalog,
    });

    expect(outcome.form.vendor_public_id).toBe("v-1");
    expect(outcome.form.bill_number).toBe("B-9");
    expect(outcome.lines[0].rate).toBe("250.00");
    expect(outcome.lines[0].amount).toBe("250.00");
    expect(outcome.lines[0].description).toBe("Materials");
    expect(outcome.lines[0].sub_cost_code_id).toBe("10");
    expect(
      (outcome.lines[0] as { coding_prefill_origin?: string }).coding_prefill_origin,
    ).toBe("file");
    expect(outcome.headerPrefill.vendor_public_id?.state).toBe("prefilled");
    expect(outcome.line1Prefill.rate?.state).toBe("prefilled");
  });

  it("disabled and unreadable do not fill", () => {
    const form = {
      vendor_public_id: "",
      payment_term_public_id: "",
      bill_date: "",
      bill_number: "",
      memo: "",
    };
    const disabled = applyReadAttachmentResult({
      result: { status: "disabled", message: null, fields: emptyFields(), coding: null, model: null },
      form,
      headerPrefill: createEmptyHeaderPrefill(),
      line1Prefill: createEmptyLine1Prefill(),
      lines: [baseLine()],
      vendors,
      sccCatalog,
    });
    expect(disabled.inlineMessage).toBeNull();
    expect(disabled.form.bill_number).toBe("");

    const unreadable = applyReadAttachmentResult({
      result: {
        status: "unreadable",
        message: "No text",
        fields: emptyFields(),
        coding: null,
        model: null,
      },
      form,
      headerPrefill: createEmptyHeaderPrefill(),
      line1Prefill: createEmptyLine1Prefill(),
      lines: [baseLine()],
      vendors,
      sccCatalog,
    });
    expect(unreadable.inlineMessage).toBe("No text");
    expect(unreadable.form.bill_number).toBe("");
  });

  it("skips vendor not in lookups", () => {
    const result: ReadAttachmentResult = {
      status: "ok",
      message: null,
      fields: {
        ...emptyFields(),
        vendor: {
          value: { public_id: "v-unknown", name: "Ghost" },
          extracted_name: "Ghost",
          confidence: null,
        },
      },
      coding: null,
      model: null,
    };
    const outcome = applyReadAttachmentResult({
      result,
      form: {
        vendor_public_id: "",
        payment_term_public_id: "",
        bill_date: "",
        bill_number: "",
        memo: "",
      },
      headerPrefill: createEmptyHeaderPrefill(),
      line1Prefill: createEmptyLine1Prefill(),
      lines: [baseLine()],
      vendors,
      sccCatalog,
    });
    expect(outcome.form.vendor_public_id).toBe("");
  });

  it("does not fill header fields the user touched (including clear) before read lands", () => {
    const result: ReadAttachmentResult = {
      status: "partial",
      message: null,
      fields: {
        ...emptyFields(),
        bill_number: { value: "FROM-FILE", confidence: "0.9" },
        bill_date: { value: "2026-04-01", confidence: "0.9" },
      },
      coding: null,
      model: null,
    };
    const outcome = applyReadAttachmentResult({
      result,
      form: {
        vendor_public_id: "",
        payment_term_public_id: "",
        bill_date: "",
        bill_number: "",
        memo: "",
      },
      headerPrefill: createEmptyHeaderPrefill(),
      headerUserTouched: { bill_number: true },
      line1Prefill: createEmptyLine1Prefill(),
      lines: [baseLine()],
      vendors,
      sccCatalog,
    });
    expect(outcome.form.bill_number).toBe("");
    expect(outcome.form.bill_date).toBe("2026-04-01");
  });

  it("applies file coding on line 1 only when multiple lines exist", () => {
    const line2 = { ...baseLine(), uid: "li-2", project_public_id: "p-2" };
    const result: ReadAttachmentResult = {
      status: "ok",
      message: null,
      fields: emptyFields(),
      coding: {
        project_public_id: "p-1",
        project_name: "P1",
        sub_cost_code_public_id: "scc-pub",
        sub_cost_code_number: "01",
        sub_cost_code_name: "Ten",
        source: "llm",
        reason: "from invoice",
        confidence: 0.8,
        model_version: "v1",
        budget_check: null,
        budget_remaining: null,
      },
      model: "test",
    };
    const outcome = applyReadAttachmentResult({
      result,
      form: {
        vendor_public_id: "",
        payment_term_public_id: "",
        bill_date: "",
        bill_number: "",
        memo: "",
      },
      headerPrefill: createEmptyHeaderPrefill(),
      line1Prefill: createEmptyLine1Prefill(),
      lines: [baseLine(), line2],
      vendors,
      sccCatalog,
    });
    expect(outcome.lines[0].sub_cost_code_id).toBe("10");
    expect(outcome.lines[1].sub_cost_code_id).toBe("");
  });
});
