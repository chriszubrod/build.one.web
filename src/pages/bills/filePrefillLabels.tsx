import { Children, type ReactNode } from "react";
import { HEADER_PREFILL_BADGE_LABEL } from "./headerPrefill";
import { BILL_LINE_CHIP_CLASS, decimalToCents } from "./codingSuggestion";
import type { BillIntakePrediction, ReadAttachmentResult } from "../../types/api";

const BUSINESS_TIMEZONE = "America/Chicago";

export function headerFieldHint(message: string): ReactNode {
  return (
    <div className="text-muted header-prefill-adornment header-prefill-hint">{message}</div>
  );
}

export function combineHeaderFieldAdornments(
  ...parts: (ReactNode | null | undefined)[]
): ReactNode {
  const nodes = parts.filter((p) => p != null && p !== false);
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0]!;
  return <>{Children.toArray(nodes)}</>;
}

/** API datetimes without an offset are treated as UTC (matches draft_from_attachment_service). */
export function parseBillApiDatetimeAsUtc(iso: string): Date | null {
  const trimmed = iso.trim();
  if (trimmed === "") return null;
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}(:\d{2})?$/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const d = new Date(`${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function chicagoCalendarDateFromCreated(
  createdDatetime: string | null | undefined,
): string | null {
  const instant = createdDatetime ? parseBillApiDatetimeAsUtc(createdDatetime) : null;
  if (!instant) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function intakePredictionIsPresent(
  prediction: BillIntakePrediction | null | undefined,
): boolean {
  if (!prediction) return false;
  const status = prediction.status;
  return status != null && status !== "";
}

export function billEditGuessedBillDateNote(
  prediction: BillIntakePrediction | null | undefined,
  form: HeaderFormSlice | null | undefined,
  billDateEditedThisSession: boolean,
  billCreatedDatetime: string | null | undefined,
): ReactNode {
  if (!form?.is_draft || billDateEditedThisSession || !intakePredictionIsPresent(prediction)) {
    return null;
  }
  if (prediction!.intake_source !== "list_drop") return null;
  if (prediction!.bill_date != null) return null;
  const formDate = asText(form.bill_date)?.slice(0, 10) ?? "";
  const createdChicago = chicagoCalendarDateFromCreated(billCreatedDatetime);
  if (formDate === "" || createdChicago == null || formDate !== createdChicago) return null;
  return headerFieldHint("Not read from the PDF — set to today.");
}

export function unmatchedVendorExtractedNameFromPrediction(
  prediction: BillIntakePrediction | null | undefined,
): string | null {
  if (!prediction?.vendor || prediction.vendor.public_id != null) return null;
  const name = (prediction.vendor.name ?? "").trim();
  return name === "" ? null : name;
}

export function unmatchedVendorNameFromReadResult(
  result: ReadAttachmentResult,
): string | null {
  const vendorField = result.fields.vendor;
  if (vendorField?.value?.public_id) return null;
  const name = (vendorField?.extracted_name ?? "").trim();
  return name === "" ? null : name;
}

export function unmatchedVendorNote(extractedName: string | null | undefined): ReactNode {
  const name = (extractedName ?? "").trim();
  if (name === "") return null;
  return headerFieldHint(`PDF says "${name}" — no matching vendor.`);
}

export function createUnmatchedVendorNote(
  extractedName: string | null | undefined,
  vendorPublicId: string,
): ReactNode {
  if ((vendorPublicId ?? "").trim() !== "") return null;
  return unmatchedVendorNote(extractedName);
}

export function billEditUnmatchedVendorNote(
  prediction: BillIntakePrediction | null | undefined,
  form: HeaderFormSlice | null | undefined,
  vendorPublicId: string,
): ReactNode {
  if (!form?.is_draft || !intakePredictionIsPresent(prediction)) return null;
  return createUnmatchedVendorNote(
    unmatchedVendorExtractedNameFromPrediction(prediction),
    vendorPublicId,
  );
}

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
      <span className={`status-badge coding-suggested ${BILL_LINE_CHIP_CLASS}`}>
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

// Values reach these helpers from API payloads and form state: a line's rate/amount
// arrive from GET /bill_line_items as JSON numbers, a description can be null. Never
// call string methods on them directly (U-676q hotfix: `.trim` on a number crashed Edit).
function asText(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : String(value);
}

function centsEqual(a: unknown, b: unknown): boolean {
  const ca = decimalToCents(asText(a));
  const cb = decimalToCents(asText(b));
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
        asText(form.vendor_public_id) === prediction.vendor.public_id
      );
    case "bill_number": {
      const predicted = asText(prediction.bill_number);
      const current = asText(form.bill_number);
      return predicted != null && current != null && current.trim() === predicted.trim();
    }
    case "bill_date": {
      const predicted = asText(prediction.bill_date);
      const current = asText(form.bill_date);
      if (!predicted || !current) return false;
      return current.slice(0, 10) === predicted.slice(0, 10);
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
    const predicted = asText(prediction.description);
    const current = asText(line.description);
    return predicted != null && current != null && current.trim() === predicted.trim();
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
