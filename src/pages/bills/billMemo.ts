/** Ramp-style bill memo composed from PDF read fields + entry context (QBO private note). */

export type BillMemoEntryMethod = "PDF drop" | "PDF upload" | "Manual";

export interface ComposeBillMemoParams {
  enteredBy: string;
  method: BillMemoEntryMethod;
  longDescription: string | null;
  reference: string | null;
  /** Bill number extracted from the invoice; DOC# segment uses this when it differs from the form. */
  readBillNumber: string | null;
  currentBillNumber: string | null;
}

function nonEmpty(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
}

function memoHead(enteredBy: string | null, method: BillMemoEntryMethod): string {
  if (enteredBy) return `${enteredBy} via ${method}`;
  return method;
}

function docNumberSegment(
  readBillNumber: string | null,
  currentBillNumber: string | null,
): string | null {
  const read = nonEmpty(readBillNumber);
  const current = nonEmpty(currentBillNumber);
  if (!read) return null;
  if (read === current) return null;
  return `DOC#: ${read}`;
}

export function composeBillMemo(params: ComposeBillMemoParams): string {
  const enteredBy = nonEmpty(params.enteredBy);
  const longDescription = nonEmpty(params.longDescription);
  const reference = nonEmpty(params.reference);
  const docNumber = docNumberSegment(params.readBillNumber, params.currentBillNumber);

  const segments: string[] = [];
  const head = memoHead(enteredBy, params.method);
  if (head !== "") segments.push(head);
  if (longDescription) segments.push(longDescription);
  if (reference) segments.push(`Ref: ${reference}`);
  if (docNumber) segments.push(docNumber);

  return segments.join(" | ");
}
