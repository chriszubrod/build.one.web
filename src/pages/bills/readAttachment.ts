import { rawRequest } from "../../api/client";
import type { BillCodingSuggestResponse, ReadAttachmentResult } from "../../types/api";
import { computeBillLine } from "./lineMath";
import {
  lineEligibleForSuggestionScc,
  parseConfidence,
  revertUnacceptedHookCodingPrefill,
  suggestedSccOptionIdFromResponse,
  type LineCodingFields,
  type SccCatalogEntry,
} from "./codingSuggestion";

export { revertUnacceptedCodingPrefill } from "./codingSuggestion";
import {
  applyHeaderPrefillValue,
  applyLine1PrefillValue,
  revertUnacceptedLine1Prefill,
  type HeaderPrefillField,
  type HeaderPrefillMeta,
  type HeaderUserTouched,
  type Line1PrefillMeta,
} from "./headerPrefill";

export type { ReadAttachmentResult };

/** Location state from BillList → /bill/create (in-memory File, consumed once). */
export function pullBillPdfFromLocationState(state: unknown): File | null {
  const incoming = (state as { billPdfFile?: File } | null | undefined)?.billPdfFile;
  if (!incoming || incoming.type !== "application/pdf") return null;
  return incoming;
}

export async function readBillAttachment(
  attachmentPublicId: string,
  projectPublicId: string | null,
  signal?: AbortSignal,
): Promise<ReadAttachmentResult | null> {
  try {
    const envelope = await rawRequest<{ data: ReadAttachmentResult }>(
      "/api/v1/bill/read-attachment",
      {
        method: "POST",
        body: JSON.stringify({
          attachment_public_id: attachmentPublicId,
          project_public_id: projectPublicId,
        }),
        signal,
      },
    );
    return envelope.data ?? null;
  } catch {
    // Aborts and failures alike: the caller shows the generic message (or nothing, if aborted).
    return null;
  }
}

export interface VendorLookupRow {
  public_id: string;
  name: string;
}

export interface ApplyReadAttachmentParams<
  T extends LineCodingFields & {
    description: string;
    quantity: string;
    rate: string;
    amount: string;
    markup: string;
    price: string;
  },
> {
  result: ReadAttachmentResult;
  form: Record<string, string>;
  headerPrefill: HeaderPrefillMeta;
  headerUserTouched?: HeaderUserTouched;
  line1Prefill: Line1PrefillMeta;
  lines: T[];
  vendors: VendorLookupRow[];
  sccCatalog: SccCatalogEntry[];
}

export interface ApplyReadAttachmentOutcome<
  T extends LineCodingFields & {
    description: string;
    quantity: string;
    rate: string;
    amount: string;
    markup: string;
    price: string;
  },
> {
  form: Record<string, string>;
  headerPrefill: HeaderPrefillMeta;
  line1Prefill: Line1PrefillMeta;
  lines: T[];
  /** User-facing status when status is non-ok (except disabled). */
  inlineMessage: string | null;
  /** Memo tail segments from the read (ok/partial only). */
  memoSource: { longDescription: string | null; reference: string | null } | null;
}

export const GENERIC_READ_ERROR = "Could not read this PDF — enter bill details manually.";

/** (a) File project empty, matches the line, line project still empty, or the line's project is an
 *  unaccepted hook suggestion (project-only or part of a hook pair) — the file is the single source for
 *  line 1 while a PDF is attached, so it replaces it. A user-touched project is never replaced. */
function fileProjectConstraintMet<T extends LineCodingFields>(
  line: T,
  fileProjectId: string,
): boolean {
  if (fileProjectId === "") return true;
  if (line.project_public_id === fileProjectId) return true;
  if (line.project_public_id === "") {
    return !line.coding_project_touched;
  }
  return (
    !line.coding_project_touched &&
    line.coding_prefill_origin !== "file" &&
    line.coding_prefill_state !== "accepted" &&
    line.coding_prefill_state !== "changed" &&
    line.coding_suggested_project_public_id === line.project_public_id
  );
}

/** (b) SCC cell empty/untouched, or holding an unaccepted hook prefill we will replace. */
function sccCellOpenForFile<T extends LineCodingFields>(line: T): boolean {
  if (line.unresolved_project_id != null) return false;
  if (line.coding_scc_touched) return false;
  if (line.sub_cost_code_id === "") return true;
  return (
    line.coding_prefill_state === "prefilled" &&
    line.coding_prefill_origin !== "file" &&
    line.coding_suggested_sub_cost_code_id != null &&
    line.coding_suggested_sub_cost_code_id === line.sub_cost_code_id
  );
}

/** Apply project + SCC from a PDF read as one unit when both apply; SCC alone when the read has no project. */
function applyFileReadCodingPair<T extends LineCodingFields>(
  lines: T[],
  coding: BillCodingSuggestResponse | null,
  sccCatalog: SccCatalogEntry[],
): T[] {
  if (lines.length === 0 || !coding || suggestionIsEmptyForRead(coding)) {
    return lines;
  }
  const line = lines[0];
  const projectId = coding.project_public_id ?? "";
  const sccId = suggestedSccOptionIdFromResponse(coding, sccCatalog);
  const hasFileProject = projectId !== "";
  const hasMappableScc = sccId !== "";

  if (!hasMappableScc) {
    return lines;
  }
  if (!fileProjectConstraintMet(line, projectId)) {
    return lines;
  }
  if (!sccCellOpenForFile(line)) {
    return lines;
  }

  // The constraint above guarantees the file's project may take the line (empty, equal, or a replaceable
  // hook suggestion), so it is the project the cost code is judged against; with no file project the line
  // keeps its own.
  const effectiveProject = hasFileProject ? projectId : line.project_public_id;
  if (
    !lineEligibleForSuggestionScc(
      { project_public_id: effectiveProject },
      hasFileProject ? projectId : "",
    )
  ) {
    return lines;
  }

  const cleared = revertUnacceptedHookCodingPrefill(line);
  const conf = parseConfidence(coding.confidence);
  const next: T = {
    ...cleared,
    sub_cost_code_id: sccId,
    coding_suggested_sub_cost_code_id: sccId,
    coding_prefill_state: "prefilled",
    coding_suggestion_reason: coding.reason,
    coding_suggestion_confidence: conf,
    coding_suggestion_source: coding.source,
    coding_prefill_origin: "file",
  };
  if (hasFileProject) {
    next.project_public_id = projectId;
    next.coding_suggested_project_public_id = projectId;
  } else {
    // A cost-code-only read fills the cost code alone: the line keeps the project it had.
    next.project_public_id = line.project_public_id;
  }
  return [next, ...lines.slice(1)];
}

function suggestionIsEmptyForRead(s: BillCodingSuggestResponse): boolean {
  return (
    s.source === "none" ||
    (!s.sub_cost_code_public_id && !s.project_public_id)
  );
}

function fieldValue<T>(v: T | null | undefined): T | null {
  return v ?? null;
}

function applyLine1Scalars<T extends LineCodingFields & {
  description: string;
  quantity: string;
  rate: string;
  amount: string;
  markup: string;
  price: string;
  file_description_touched?: boolean;
  file_rate_touched?: boolean;
  file_quantity_touched?: boolean;
}>(
  lines: T[],
  line1Prefill: Line1PrefillMeta,
  result: ReadAttachmentResult,
): { lines: T[]; line1Prefill: Line1PrefillMeta } {
  if (lines.length === 0) return { lines, line1Prefill };
  const line = lines[0];
  let next: T = { ...line };
  let meta = { ...line1Prefill };
  let changed = false;

  const desc = fieldValue(result.fields.description?.value);
  if (desc && next.description === "" && !next.file_description_touched) {
    const applied = applyLine1PrefillValue(meta, "description", desc, next.description);
    if (applied) {
      next = { ...next, description: applied.value };
      meta = applied.meta;
      changed = true;
    }
  }

  const total = fieldValue(result.fields.total_amount?.value);
  if (total && next.rate === "" && !next.file_rate_touched) {
    const qtyOk =
      !next.file_quantity_touched &&
      (next.quantity === "" || next.quantity === "1");
    if (qtyOk) {
      if (next.quantity !== "1") {
        next = { ...next, quantity: "1" };
        changed = true;
      }
      const rateApplied = applyLine1PrefillValue(meta, "rate", total, next.rate);
      if (rateApplied) {
        next = { ...next, rate: rateApplied.value };
        meta = rateApplied.meta;
        changed = true;
      }
    }
  }

  if (!changed) return { lines, line1Prefill: meta };
  next = computeBillLine(next);
  return { lines: [next, ...lines.slice(1)], line1Prefill: meta };
}

/**
 * Apply a read-attachment response to create form state.
 * Ordering: header scalars first, then line-1 amount/description, then coding via
 * applySuggestionToLines (same rules as history/LLM suggest — empty/untouched only).
 */
export function applyReadAttachmentResult<
  T extends LineCodingFields & {
    description: string;
    quantity: string;
    rate: string;
    amount: string;
    markup: string;
    price: string;
    file_description_touched?: boolean;
    file_rate_touched?: boolean;
    file_quantity_touched?: boolean;
  },
>(params: ApplyReadAttachmentParams<T>): ApplyReadAttachmentOutcome<T> {
  const { result, vendors, sccCatalog, headerUserTouched = {} } = params;
  let form = { ...params.form };
  let headerPrefill = { ...params.headerPrefill };
  let line1Prefill = { ...params.line1Prefill };
  let lines = params.lines;

  if (result.status === "disabled") {
    return { form, headerPrefill, line1Prefill, lines, inlineMessage: null, memoSource: null };
  }

  if (
    result.status === "unreadable" ||
    result.status === "timeout" ||
    result.status === "ai_unavailable"
  ) {
    return {
      form,
      headerPrefill,
      line1Prefill,
      lines,
      inlineMessage: result.message?.trim() || GENERIC_READ_ERROR,
      memoSource: null,
    };
  }

  if (result.status !== "ok" && result.status !== "partial") {
    return {
      form,
      headerPrefill,
      line1Prefill,
      lines,
      inlineMessage: GENERIC_READ_ERROR,
      memoSource: null,
    };
  }

  const memoSource = {
    longDescription: fieldValue(result.fields.long_description?.value),
    reference: fieldValue(result.fields.reference?.value),
  };

  const vendorVal = result.fields.vendor?.value;
  if (vendorVal?.public_id) {
    const known = vendors.some((v) => v.public_id === vendorVal.public_id);
    if (known) {
      const applied = applyHeaderPrefillValue(
        headerPrefill,
        form,
        "vendor_public_id" satisfies HeaderPrefillField,
        vendorVal.public_id,
        headerUserTouched,
      );
      if (applied) {
        form = applied.form;
        headerPrefill = applied.meta;
      }
    }
  }

  for (const [field, raw] of [
    ["bill_number", result.fields.bill_number?.value] as const,
    ["bill_date", result.fields.bill_date?.value] as const,
  ]) {
    const val = fieldValue(raw);
    if (val) {
      const applied = applyHeaderPrefillValue(
        headerPrefill,
        form,
        field satisfies HeaderPrefillField,
        val,
        headerUserTouched,
      );
      if (applied) {
        form = applied.form;
        headerPrefill = applied.meta;
      }
    }
  }

  const scalarOutcome = applyLine1Scalars(lines, line1Prefill, result);
  lines = scalarOutcome.lines;
  line1Prefill = scalarOutcome.line1Prefill;

  lines = applyFileReadCodingPair(lines, result.coding, sccCatalog);

  return { form, headerPrefill, line1Prefill, lines, inlineMessage: null, memoSource };
}

export function revertUnacceptedLine1Scalars<
  T extends LineCodingFields & {
    description: string;
    quantity: string;
    rate: string;
    amount: string;
    markup: string;
    price: string;
    file_description_touched?: boolean;
    file_quantity_touched?: boolean;
    file_rate_touched?: boolean;
  },
>(line: T, line1Prefill: Line1PrefillMeta): T {
  const reverted = revertUnacceptedLine1Prefill(line1Prefill, line);
  return computeBillLine(reverted.line);
}

