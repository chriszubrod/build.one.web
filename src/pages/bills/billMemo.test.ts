import { describe, it, expect } from "vitest";
import { composeBillMemo, type BillMemoEntryMethod } from "./billMemo";

describe("composeBillMemo", () => {
  it.each([
    {
      name: "full format",
      params: {
        enteredBy: "Chris Z",
        method: "PDF upload" as BillMemoEntryMethod,
        longDescription: "Biweekly mowing service, Oct 1-15",
        reference: "PO 1123",
        readBillNumber: "INV-42",
        currentBillNumber: "INV-42",
      },
      want:
        "Chris Z via PDF upload | Biweekly mowing service, Oct 1-15 | Ref: PO 1123",
    },
    {
      name: "omits empty tail segments and separators",
      params: {
        enteredBy: "Chris Z",
        method: "PDF drop" as BillMemoEntryMethod,
        longDescription: null,
        reference: null,
        readBillNumber: null,
        currentBillNumber: "",
      },
      want: "Chris Z via PDF drop",
    },
    {
      name: "enteredBy empty uses method alone",
      params: {
        enteredBy: "",
        method: "Manual" as BillMemoEntryMethod,
        longDescription: "Summary only",
        reference: null,
        readBillNumber: null,
        currentBillNumber: "",
      },
      want: "Manual | Summary only",
    },
    {
      name: "reference without long description",
      params: {
        enteredBy: "U",
        method: "PDF upload" as BillMemoEntryMethod,
        longDescription: null,
        reference: "Job 2026-044",
        readBillNumber: "A",
        currentBillNumber: "A",
      },
      want: "U via PDF upload | Ref: Job 2026-044",
    },
    {
      name: "DOC# when read number differs from form",
      params: {
        enteredBy: "U",
        method: "PDF drop" as BillMemoEntryMethod,
        longDescription: null,
        reference: null,
        readBillNumber: "INV-ORIG",
        currentBillNumber: "EDITED",
      },
      want: "U via PDF drop | DOC#: INV-ORIG",
    },
    {
      name: "no DOC# when read matches form",
      params: {
        enteredBy: "U",
        method: "PDF upload" as BillMemoEntryMethod,
        longDescription: "x",
        reference: null,
        readBillNumber: "INV-42",
        currentBillNumber: " INV-42 ",
      },
      want: "U via PDF upload | x",
    },
    {
      name: "method strings PDF drop and PDF upload",
      params: {
        enteredBy: "A",
        method: "PDF drop" as BillMemoEntryMethod,
        longDescription: null,
        reference: null,
        readBillNumber: null,
        currentBillNumber: "",
      },
      want: "A via PDF drop",
    },
  ])("$name", ({ params, want }) => {
    expect(composeBillMemo(params)).toBe(want);
  });

  it("never includes project, cost code, or short description", () => {
    const memo = composeBillMemo({
      enteredBy: "Chris Z",
      method: "PDF upload",
      longDescription: "Long only",
      reference: "R1",
      readBillNumber: "N1",
      currentBillNumber: "N2",
    });
    expect(memo).not.toMatch(/\bP1\b|01-100|Biweekly|Multiple/i);
    expect(memo).toBe("Chris Z via PDF upload | Long only | Ref: R1 | DOC#: N1");
  });
});
