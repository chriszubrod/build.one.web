import { describe, it, expect } from "vitest";
import { composeBillMemo, type BillMemoLineSlice } from "./billMemo";

const line = (partial: Partial<BillMemoLineSlice> = {}): BillMemoLineSlice => ({
  project_public_id: "p-1",
  sub_cost_code_id: "10",
  description: "Biweekly Mowing",
  ...partial,
});

describe("composeBillMemo", () => {
  it.each([
    {
      name: "full memo",
      params: {
        enteredBy: "Chris Z",
        populatedLines: [line()],
        projectLabelForLine: () => "P1",
        costCodeNumberForLine: () => "01-100",
        longDescription: "Biweekly mowing service, Oct 1-15",
        reference: "PO 1123",
      },
      want:
        "Chris Z - P1 - 01-100 - Biweekly Mowing | Biweekly mowing service, Oct 1-15 | Ref: PO 1123",
    },
    {
      name: "omits empty segments and separators",
      params: {
        enteredBy: "Chris Z",
        populatedLines: [line({ description: "" })],
        projectLabelForLine: () => null,
        costCodeNumberForLine: () => null,
        longDescription: null,
        reference: null,
      },
      want: "Chris Z",
    },
    {
      name: "long description only in tail",
      params: {
        enteredBy: "",
        populatedLines: [line({ project_public_id: "", sub_cost_code_id: "" })],
        projectLabelForLine: () => null,
        costCodeNumberForLine: () => null,
        longDescription: "Summary only",
        reference: null,
      },
      want: "Biweekly Mowing | Summary only",
    },
    {
      name: "reference without long description",
      params: {
        enteredBy: "U",
        populatedLines: [line()],
        projectLabelForLine: () => "Proj",
        costCodeNumberForLine: () => "99",
        longDescription: null,
        reference: "Job 2026-044",
      },
      want: "U - Proj - 99 - Biweekly Mowing | Ref: Job 2026-044",
    },
    {
      name: "multiple projects",
      params: {
        enteredBy: "U",
        populatedLines: [
          line({ project_public_id: "p-1" }),
          line({ project_public_id: "p-2", description: "Line two" }),
        ],
        projectLabelForLine: (l: BillMemoLineSlice) =>
          l.project_public_id === "p-1" ? "A" : "B",
        costCodeNumberForLine: () => "01",
        longDescription: null,
        reference: null,
      },
      want: "U - Multiple - 01 - Biweekly Mowing",
    },
    {
      name: "multiple cost codes",
      params: {
        enteredBy: "U",
        populatedLines: [
          line({ sub_cost_code_id: "1" }),
          line({ sub_cost_code_id: "2", description: "x" }),
        ],
        projectLabelForLine: () => "P1",
        costCodeNumberForLine: (l: BillMemoLineSlice) =>
          l.sub_cost_code_id === "1" ? "01" : "02",
        longDescription: null,
        reference: null,
      },
      want: "U - P1 - Multiple - Biweekly Mowing",
    },
  ])("$name", ({ params, want }) => {
    expect(composeBillMemo(params)).toBe(want);
  });
});
