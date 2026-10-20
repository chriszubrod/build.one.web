import type { ReactNode } from "react";
import { HEADER_PREFILL_BADGE_LABEL } from "./headerPrefill";
import { BILL_CREATE_LINE_CHIP_CLASS, decimalToCents } from "./codingSuggestion";
import type { BillIntakePrediction } from "../../types/api";

export function headerFilePrefillLabel(): ReactNode {
  return (
    <div className="coding-suggestion-actions header-prefill-adornment">
      <span className="status-badge coding-suggested">{HEADER_PREFILL_BADGE_LABEL}</span>
    </div>
  );
}

export function lineRowFilePrefillLabel(): ReactNode {
  return (
    <div className="coding-suggestion-actions coding-suggestion-actions-compact">
      <span className={`status-badge coding-suggested ${BILL_CREATE_LINE_CHIP_CLASS}`}>
        {HEADER_PREFILL_BADGE_LABEL}
      </span>
    </div>
  );
}

export function filePrefillLabel<F extends string>(
  meta: { [K in F]?: { state?: string } },
  field: F,
  lineRow: boolean,
): ReactNode {
  if (meta[field]?.state !== "prefilled") return null;
  return lineRow ? lineRowFilePrefillLabel() : headerFilePrefillLabel();
}

export type HeaderFormSlice = {
  is_draft: boolean;
  vendor_public_id: string;
  bill_number: string;
  bill_date: string;
};

type Line1Slice = {
  description: string;
  rate: string;
  amount: string;
};

function centsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = decimalToCents(a);
  const cb = decimalToCents(b);
  if (ca === null || cb === null) return false;
  return ca === cb;
}

export function headerFieldMatchesPrediction(
  prediction: BillIntakePrediction,
  form: HeaderFormSlice,
  field: "vendor_public_id" | "bill_number" | "bill_date",
): boolean {
  switch (field) {
    case "vendor_public_id":
      return (
        !!prediction.vendor?.public_id &&
        form.vendor_public_id === prediction.vendor.public_id
      );
    case "bill_number":
      return (
        prediction.bill_number != null &&
        form.bill_number.trim() === prediction.bill_number.trim()
      );
    case "bill_date": {
      if (!prediction.bill_date || !form.bill_date) return false;
      return form.bill_date.slice(0, 10) === prediction.bill_date.slice(0, 10);
    }
  }
}

export function line1FieldMatchesPrediction(
  prediction: BillIntakePrediction,
  line: Line1Slice | undefined,
  field: "description" | "rate" | "amount",
): boolean {
  if (!line) return false;
  if (field === "description") {
    return (
      prediction.description != null &&
      line.description.trim() === prediction.description.trim()
    );
  }
  if (prediction.total_amount == null) return false;
  if (field === "rate") {
    return centsEqual(line.rate, prediction.total_amount);
  }
  return centsEqual(line.amount, prediction.total_amount);
}

export function billEditFilePrefillAdornment(
  prediction: BillIntakePrediction | null | undefined,
  form: HeaderFormSlice | null | undefined,
  field: "vendor_public_id" | "bill_number" | "bill_date",
): ReactNode {
  if (!form?.is_draft || !prediction) return null;
  if (!headerFieldMatchesPrediction(prediction, form, field)) return null;
  return headerFilePrefillLabel();
}

export function billEditLine1FilePrefillAdornment(
  prediction: BillIntakePrediction | null | undefined,
  form: HeaderFormSlice | null | undefined,
  line: Line1Slice | undefined,
  field: "description" | "rate" | "amount",
): ReactNode {
  if (!form?.is_draft || !prediction) return null;
  if (!line1FieldMatchesPrediction(prediction, line, field)) return null;
  return lineRowFilePrefillLabel();
}
