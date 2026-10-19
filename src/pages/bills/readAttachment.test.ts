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
    long_description: { value: null, confidence: null },
    reference: { value: null, confidence: null },
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

  it("returns memoSource on ok reads", () => {
    const result: ReadAttachmentResult = {
      status: "ok",
      message: null,
      fields: {
        ...emptyFields(),
        long_description: { value: "Long tail", confidence: "0.5" },
        reference: { value: "PO 1", confidence: "0.5" },
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
    expect(outcome.memoSource).toEqual({
      longDescription: "Long tail",
      reference: "PO 1",
    });
  });

  it("applies file coding project and SCC as a pair only", () => {
    const touchedScc = {
      ...baseLine(),
      coding_scc_touched: true,
      sub_cost_code_id: "99",
    };
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
    const blocked = applyReadAttachmentResult({
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
      lines: [touchedScc],
      vendors,
      sccCatalog,
    });
    expect(blocked.lines[0].project_public_id).toBe("");

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
    expect(outcome.lines[0].project_public_id).toBe("p-1");
    expect(outcome.lines[0].sub_cost_code_id).toBe("10");
  });

  it("replaces unaccepted hook coding with the file pair", () => {
    const hookPrefilled = {
      ...baseLine(),
      sub_cost_code_id: "10",
      coding_prefill_state: "prefilled" as const,
      coding_suggested_sub_cost_code_id: "10",
      coding_suggestion_source: "vendor_history" as const,
    };
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
      lines: [hookPrefilled],
      vendors,
      sccCatalog,
    });
    expect(outcome.lines[0].project_public_id).toBe("p-1");
    expect(
      (outcome.lines[0] as { coding_prefill_origin?: string }).coding_prefill_origin,
    ).toBe("file");
  });

  it("leaves hook prefill intact when file SCC is unmappable", () => {
    const hookPrefilled = {
      ...baseLine(),
      sub_cost_code_id: "10",
      project_public_id: "p-9",
      coding_prefill_state: "prefilled" as const,
      coding_suggested_sub_cost_code_id: "10",
      coding_suggested_project_public_id: "p-9",
      coding_suggestion_source: "llm" as const,
    };
    const result: ReadAttachmentResult = {
      status: "ok",
      message: null,
      fields: emptyFields(),
      coding: {
        project_public_id: "p-1",
        project_name: "P1",
        sub_cost_code_public_id: "scc-unknown",
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
      lines: [hookPrefilled],
      vendors,
      sccCatalog,
    });
    expect(outcome.lines[0].sub_cost_code_id).toBe("10");
    expect(outcome.lines[0].project_public_id).toBe("p-9");
  });

  it("applies file SCC when the user picked the same project as the file", () => {
    const userProject = {
      ...baseLine(),
      project_public_id: "p-1",
      coding_project_touched: true,
    };
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
      lines: [userProject],
      vendors,
      sccCatalog,
    });
    expect(outcome.lines[0].project_public_id).toBe("p-1");
    expect(outcome.lines[0].sub_cost_code_id).toBe("10");
  });

  it("applies SCC-only file coding when the read has no project", () => {
    const result: ReadAttachmentResult = {
      status: "ok",
      message: null,
      fields: emptyFields(),
      coding: {
        project_public_id: null,
        project_name: null,
        sub_cost_code_public_id: "scc-pub",
        sub_cost_code_number: "01",
        sub_cost_code_name: "Ten",
        source: "vendor_history",
        reason: "history",
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
    expect(outcome.lines[0].sub_cost_code_id).toBe("10");
    expect(outcome.lines[0].project_public_id).toBe("");
  });

  it("replaces hook SCC when user project matches the file pair", () => {
    const line = {
      ...baseLine(),
      project_public_id: "p-1",
      coding_project_touched: true,
      sub_cost_code_id: "10",
      coding_prefill_state: "prefilled" as const,
      coding_suggested_sub_cost_code_id: "10",
      coding_suggestion_source: "vendor_history" as const,
    };
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
      lines: [line],
      vendors,
      sccCatalog,
    });
    expect(outcome.lines[0].project_public_id).toBe("p-1");
    expect(outcome.lines[0].sub_cost_code_id).toBe("10");
    expect(
      (outcome.lines[0] as { coding_prefill_origin?: string }).coding_prefill_origin,
    ).toBe("file");
  });
});

// Round 2 (EM): the file is the single source for line 1 while a PDF is attached — it replaces an
// unaccepted hook suggestion (project-only or a pair), but never a project the user touched.
describe("applyReadAttachmentResult — file pair vs hook suggestions (U-676h r2)", () => {
  function fileCoding(project: string | null) {
    return {
      project_public_id: project,
      project_name: project ? "P1" : null,
      sub_cost_code_public_id: "scc-pub",
      sub_cost_code_number: "01",
      sub_cost_code_name: "Ten",
      source: "llm" as const,
      reason: "from invoice",
      confidence: 0.8,
      model_version: "v1",
      budget_check: null,
      budget_remaining: null,
    };
  }
  function apply(line: ReturnType<typeof baseLine> & Record<string, unknown>, project: string | null) {
    return applyReadAttachmentResult({
      result: { status: "ok", message: null, fields: emptyFields(), coding: fileCoding(project), model: "t" },
      form: { vendor_public_id: "", payment_term_public_id: "", bill_date: "", bill_number: "", memo: "" },
      headerPrefill: createEmptyHeaderPrefill(),
      line1Prefill: createEmptyLine1Prefill(),
      lines: [line],
      vendors,
      sccCatalog,
    }).lines[0] as Record<string, unknown>;
  }

  it("U-676k sets coding_project_prefill_origin file only when the file fills project", () => {
    const sccOnly = apply({ ...baseLine() }, null);
    expect(sccOnly.coding_prefill_origin).toBe("file");
    expect(sccOnly.coding_project_prefill_origin).toBeUndefined();

    const withProject = apply({ ...baseLine() }, "p-1");
    expect(withProject.coding_project_prefill_origin).toBe("file");
  });

  it("replaces a hook project-only fill with the file's DIFFERENT project + cost code (H)", () => {
    const out = apply(
      { ...baseLine(), project_public_id: "p-9", coding_suggested_project_public_id: "p-9" },
      "p-1",
    );
    expect(out.project_public_id).toBe("p-1");
    expect(out.sub_cost_code_id).toBe("10");
    expect(out.coding_prefill_origin).toBe("file");
  });

  it("replaces an unaccepted hook PAIR with the file's pair for a different project (G)", () => {
    const out = apply(
      {
        ...baseLine(),
        project_public_id: "p-9",
        sub_cost_code_id: "20",
        coding_prefill_state: "prefilled",
        coding_suggested_project_public_id: "p-9",
        coding_suggested_sub_cost_code_id: "20",
        coding_suggestion_source: "llm",
      },
      "p-1",
    );
    expect(out.project_public_id).toBe("p-1");
    expect(out.sub_cost_code_id).toBe("10");
  });

  it("never replaces a project the user touched, even when it equals the hook's suggestion (E)", () => {
    const out = apply(
      {
        ...baseLine(),
        project_public_id: "p-9",
        coding_project_touched: true,
        sub_cost_code_id: "20",
        coding_prefill_state: "prefilled",
        coding_suggested_project_public_id: "p-9",
        coding_suggested_sub_cost_code_id: "20",
        coding_suggestion_source: "vendor_history",
      },
      null,
    );
    expect(out.project_public_id).toBe("p-9");
    expect(out.sub_cost_code_id).toBe("10");
  });

  it("a cost-code-only read keeps the line's existing project (F)", () => {
    const out = apply(
      {
        ...baseLine(),
        project_public_id: "p-9",
        sub_cost_code_id: "20",
        coding_prefill_state: "prefilled",
        coding_suggested_project_public_id: "p-9",
        coding_suggested_sub_cost_code_id: "20",
        coding_suggestion_source: "llm",
      },
      null,
    );
    expect(out.project_public_id).toBe("p-9");
    expect(out.sub_cost_code_id).toBe("10");
  });

  it("does not replace an ACCEPTED hook pair", () => {
    const out = apply(
      {
        ...baseLine(),
        project_public_id: "p-9",
        sub_cost_code_id: "20",
        coding_prefill_state: "accepted",
        coding_suggested_project_public_id: "p-9",
        coding_suggested_sub_cost_code_id: "20",
      },
      "p-1",
    );
    expect(out.project_public_id).toBe("p-9");
    expect(out.sub_cost_code_id).toBe("20");
  });
});
