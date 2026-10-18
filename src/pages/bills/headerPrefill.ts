/** Client-side acceptance for bill header fields filled from a PDF read. */

export type HeaderPrefillField = "vendor_public_id" | "bill_number" | "bill_date";

export type PrefillReviewState = "prefilled" | "accepted" | "changed";

export type HeaderPrefillMeta = Partial<
  Record<HeaderPrefillField, { state: PrefillReviewState; value: string }>
>;

export function createEmptyHeaderPrefill(): HeaderPrefillMeta {
  return {};
}

export function headerFieldIsEmpty(form: Record<string, string>, field: HeaderPrefillField): boolean {
  return (form[field] ?? "") === "";
}

export type HeaderUserTouched = Partial<Record<HeaderPrefillField, boolean>>;

export function applyHeaderPrefillValue(
  meta: HeaderPrefillMeta,
  form: Record<string, string>,
  field: HeaderPrefillField,
  value: string,
  userTouched: HeaderUserTouched = {},
): { meta: HeaderPrefillMeta; form: Record<string, string> } | null {
  if (value === "") return null;
  if (userTouched[field]) return null;
  const existing = meta[field];
  if (existing?.state === "accepted" || existing?.state === "changed") return null;
  if (!headerFieldIsEmpty(form, field)) return null;
  return {
    meta: { ...meta, [field]: { state: "prefilled", value } },
    form: { ...form, [field]: value },
  };
}

export function markHeaderUserEdit(
  meta: HeaderPrefillMeta,
  field: HeaderPrefillField,
): HeaderPrefillMeta {
  const cell = meta[field];
  if (cell?.state === "prefilled" || cell?.state === "accepted") {
    return { ...meta, [field]: { ...cell, state: "changed" } };
  }
  return meta;
}

export function acceptHeaderPrefillField(
  meta: HeaderPrefillMeta,
  field: HeaderPrefillField,
): HeaderPrefillMeta {
  const cell = meta[field];
  if (cell?.state !== "prefilled") return meta;
  return { ...meta, [field]: { ...cell, state: "accepted" } };
}

export function acceptAllHeaderPrefill(meta: HeaderPrefillMeta): HeaderPrefillMeta {
  let next = meta;
  for (const field of HEADER_PREFILL_FIELDS) {
    next = acceptHeaderPrefillField(next, field);
  }
  return next;
}

export const HEADER_PREFILL_FIELDS: HeaderPrefillField[] = [
  "vendor_public_id",
  "bill_number",
  "bill_date",
];

export function headersHaveUnreviewedPrefill(meta: HeaderPrefillMeta): boolean {
  return HEADER_PREFILL_FIELDS.some((f) => meta[f]?.state === "prefilled");
}

/** Drop unaccepted file-filled header values; keep accepted/changed and user-typed fields. */
export function revertUnacceptedHeaderPrefill(
  meta: HeaderPrefillMeta,
  form: Record<string, string>,
): { meta: HeaderPrefillMeta; form: Record<string, string> } {
  let nextForm = { ...form };
  const nextMeta: HeaderPrefillMeta = { ...meta };
  for (const field of HEADER_PREFILL_FIELDS) {
    const cell = meta[field];
    if (cell?.state !== "prefilled") continue;
    delete nextMeta[field];
    if (nextForm[field] === cell.value) {
      nextForm = { ...nextForm, [field]: "" };
    }
  }
  return { meta: nextMeta, form: nextForm };
}

export const HEADER_PREFILL_BADGE_LABEL = "From file";

/** Line 1 scalar fields filled from a PDF read (acceptance gate matches header). */
export type Line1PrefillField = "description" | "rate" | "quantity";

export type Line1PrefillMeta = Partial<
  Record<Line1PrefillField, { state: PrefillReviewState; value: string }>
>;

export const LINE1_PREFILL_FIELDS: Line1PrefillField[] = [
  "description",
  "rate",
  "quantity",
];

export function createEmptyLine1Prefill(): Line1PrefillMeta {
  return {};
}

export function line1HasUnreviewedPrefill(meta: Line1PrefillMeta): boolean {
  return LINE1_PREFILL_FIELDS.some((f) => meta[f]?.state === "prefilled");
}

export function applyLine1PrefillValue(
  meta: Line1PrefillMeta,
  field: Line1PrefillField,
  value: string,
  current: string,
): { meta: Line1PrefillMeta; value: string } | null {
  if (value === "") return null;
  const existing = meta[field];
  if (existing?.state === "accepted" || existing?.state === "changed") return null;
  if (current !== "" && current !== value) return null;
  return {
    meta: { ...meta, [field]: { state: "prefilled", value } },
    value,
  };
}

export function markLine1PrefillUserEdit(
  meta: Line1PrefillMeta,
  field: Line1PrefillField,
): Line1PrefillMeta {
  const cell = meta[field];
  if (cell?.state === "prefilled" || cell?.state === "accepted") {
    return { ...meta, [field]: { ...cell, state: "changed" } };
  }
  return meta;
}

export function acceptLine1PrefillField(
  meta: Line1PrefillMeta,
  field: Line1PrefillField,
): Line1PrefillMeta {
  const cell = meta[field];
  if (cell?.state !== "prefilled") return meta;
  return { ...meta, [field]: { ...cell, state: "accepted" } };
}

export function acceptAllLine1Prefill(meta: Line1PrefillMeta): Line1PrefillMeta {
  let next = meta;
  for (const field of LINE1_PREFILL_FIELDS) {
    next = acceptLine1PrefillField(next, field);
  }
  return next;
}

export function revertUnacceptedLine1Prefill<
  T extends { description: string; quantity: string; rate: string },
>(meta: Line1PrefillMeta, line: T): { meta: Line1PrefillMeta; line: T } {
  let nextLine = { ...line };
  const nextMeta: Line1PrefillMeta = { ...meta };
  for (const field of LINE1_PREFILL_FIELDS) {
    const cell = meta[field];
    if (cell?.state !== "prefilled") continue;
    delete nextMeta[field];
    if (field === "description" && nextLine.description === cell.value) {
      nextLine = { ...nextLine, description: "" };
    }
    if (field === "rate" && nextLine.rate === cell.value) {
      nextLine = { ...nextLine, rate: "" };
    }
    if (field === "quantity" && nextLine.quantity === cell.value) {
      nextLine = { ...nextLine, quantity: "1" };
    }
  }
  return { meta: nextMeta, line: nextLine };
}
