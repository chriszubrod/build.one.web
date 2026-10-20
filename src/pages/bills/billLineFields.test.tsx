import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BILL_LINE_COL,
  buildBillLineFields,
  fmtBillLineMoney,
  projectOptionLabel,
} from "./billLineFields";

describe("billLineFields", () => {
  it("fmtBillLineMoney shows $0.00 for empty", () => {
    expect(fmtBillLineMoney("")).toBe("$0.00");
    expect(fmtBillLineMoney("12.5")).toBe("$12.50");
  });

  it("projectOptionLabel de-duplicates abbreviation prefix", () => {
    expect(projectOptionLabel("HP2", "HP2 - 4406 Harding")).toBe("HP2 - 4406 Harding");
    expect(projectOptionLabel("HP2", "Harding Place")).toBe("HP2 — Harding Place");
  });

  it("buildBillLineFields pins width contracts on every column", () => {
    const fields = buildBillLineFields({
      mode: "create",
      sccOptions: [],
      projectOptions: [],
    });
    const desc = fields.find((f) => f.key === "description")!;
    expect(desc.col?.className).toBe(BILL_LINE_COL.desc.className);
    expect(desc.col?.contract).toBe(BILL_LINE_COL.desc.contract);
    expect(fields.find((f) => f.key === "amount")?.readOnly).toBe(true);
  });

  it("edit mode shows suggestion chips only while showDraftBadges is set", () => {
    const line = {
      uid: "u1",
      description: "",
      quantity: "1",
      rate: "",
      amount: "",
      markup: "",
      price: "",
      is_billable: true,
      sub_cost_code_id: "10",
      project_public_id: "p-1",
      coding_prefill_state: "prefilled" as const,
      coding_suggested_sub_cost_code_id: "10",
      coding_suggested_project_public_id: "p-1",
      coding_suggestion_confidence: 72,
    };
    const chips = (showDraftBadges: boolean) => {
      const fields = buildBillLineFields({
        mode: "edit",
        sccOptions: [],
        projectOptions: [],
        showDraftBadges,
      });
      return ["sub_cost_code_id", "project_public_id"].map((key) => {
        const node = fields.find((f) => f.key === key)!.adornment!(line, 0);
        return node == null ? "" : renderToStaticMarkup(<>{node}</>);
      });
    };
    for (const html of chips(true)) expect(html).toContain("bill-line-chip");
    expect(chips(false)).toEqual(["", ""]);
  });
});
