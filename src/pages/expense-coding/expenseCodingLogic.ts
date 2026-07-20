import type { ExpenseCodingMetrics, ExpenseCodingQueueRow } from "../../types/api";

export type CodingStatus =
  | "pending"
  | "suggested"
  | "flagged"
  | "confirmed"
  | "enqueued"
  | "written"
  | "changed_in_qbo"
  | "error";

export const CODING_STATUS_LABELS: Record<CodingStatus, string> = {
  pending: "Pending",
  suggested: "Suggested",
  flagged: "Flagged",
  confirmed: "Confirmed",
  enqueued: "Enqueued",
  written: "Written",
  changed_in_qbo: "Changed in QBO",
  error: "Error",
};

export const CODING_STATUS_CLASSES: Record<CodingStatus, string> = {
  pending: "coding-pending",
  suggested: "coding-suggested",
  flagged: "coding-flagged",
  confirmed: "coding-confirmed",
  enqueued: "coding-enqueued",
  written: "coding-written",
  changed_in_qbo: "coding-changed",
  error: "coding-error",
};

export function codingStatusLabel(status: string | null | undefined): string {
  if (!status) return "Pending";
  return CODING_STATUS_LABELS[status as CodingStatus] ?? status;
}

export function codingStatusClass(status: string | null | undefined): string {
  if (!status) return CODING_STATUS_CLASSES.pending;
  return CODING_STATUS_CLASSES[status as CodingStatus] ?? CODING_STATUS_CLASSES.pending;
}

export interface RowCodingSelection {
  projectId: number | null;
  subCostCodeId: number | null;
  description: string;
}

export function initialSelectionFromRow(row: ExpenseCodingQueueRow): RowCodingSelection {
  return {
    projectId: row.confirmed_project_id ?? row.suggested_project_id ?? null,
    subCostCodeId: row.confirmed_sub_cost_code_id ?? row.suggested_sub_cost_code_id ?? null,
    description: row.confirmed_description ?? row.suggested_description ?? "",
  };
}

export function computeWasOverridden(
  selection: RowCodingSelection,
  row: Pick<
    ExpenseCodingQueueRow,
    "suggested_project_id" | "suggested_sub_cost_code_id" | "suggested_description"
  >,
): boolean {
  const suggestedDesc = row.suggested_description ?? "";
  return (
    selection.projectId !== row.suggested_project_id ||
    selection.subCostCodeId !== row.suggested_sub_cost_code_id ||
    selection.description !== suggestedDesc
  );
}

export function computeAutoClearedPct(metrics: ExpenseCodingMetrics): number {
  if (metrics.total_target_lines <= 0) return 0;
  return (metrics.accepted_count / metrics.total_target_lines) * 100;
}

export function formatAutoClearedPct(metrics: ExpenseCodingMetrics): string {
  const pct = computeAutoClearedPct(metrics);
  return `${pct.toFixed(1)}%`;
}

/**
 * Write-gate policy: recode writes are OFF only when the api explicitly says
 * so. `recode_writes_enabled` is optional (a persisted pre-U-058a metrics
 * payload can hydrate without it) — omitted means "unknown" and behaves as
 * enabled; the api's 422 on a gate-off confirm is the backstop for that case.
 */
export function recodeWritesOff(metrics: ExpenseCodingMetrics | undefined): boolean {
  return metrics?.recode_writes_enabled === false;
}

export function formatSuggestionHelper(
  reason: string | null | undefined,
  confidence: number | string | null | undefined,
): string | null {
  if (!reason && confidence == null) return null;
  let conf: string | null = null;
  if (typeof confidence === "number") {
    // Percent-native and rounded directly — do NOT route through the badge's
    // ratio normalization (confidenceRatio). A /100→*100 round-trip flips the
    // rounding of half-integer percents (e.g. 14.5 → "14%" instead of "15%"),
    // and this path is unguarded for non-finite (NaN → "NaN%") by design.
    const pct = confidence <= 1 ? confidence * 100 : confidence;
    conf = `${Math.round(pct)}%`;
  } else if (confidence != null) {
    conf = String(confidence);
  }
  if (reason && conf) return `${reason} · ${conf}`;
  return reason ?? conf;
}

/**
 * Confidence tiering + confidence-first ordering for the coding queue.
 *
 * Keyed STRICTLY on the existing queue-row field `suggestion_confidence`
 * (number | null) so this stays a one-file re-point if the endpoint reshapes.
 * A null/non-finite confidence has no score to tier ("none") — that is a
 * statement about the confidence field only, not about whether a suggestion
 * reason exists.
 *
 * The tier string doubles as the CSS modifier suffix
 * (`.expense-coding-confidence-badge--<tier>` in index.css), so these values are
 * load-bearing: rename a tier here and you must rename the class too. No
 * translation map is needed the way `CODING_STATUS_CLASSES` needs one, because
 * the tier already IS the suffix (status names, by contrast, differ from their
 * class names).
 */
export type ConfidenceTier = "high" | "medium" | "low" | "none";

export const CONFIDENCE_TIER_LABELS: Record<ConfidenceTier, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No score",
};

/**
 * The single ratio normalizer for the tier/pct/sort family: a value <=1 is
 * already a ratio, a value >1 is an already-percent figure, null/non-finite has
 * no score. Kept ratio-native and deliberately NOT merged with
 * `formatSuggestionHelper` (which is percent-native): a shared /100→*100
 * round-trip would flip the rounding of half-integer percents there.
 */
function confidenceRatio(conf: number | null): number | null {
  if (conf == null || !Number.isFinite(conf)) return null;
  return conf <= 1 ? conf : conf / 100;
}

export function confidenceTier(conf: number | null): ConfidenceTier {
  const ratio = confidenceRatio(conf);
  if (ratio == null) return "none";
  if (ratio >= 0.9) return "high";
  if (ratio >= 0.6) return "medium";
  return "low";
}

export function formatConfidencePct(conf: number | null): string | null {
  const ratio = confidenceRatio(conf);
  if (ratio == null) return null;
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Confidence-first ordering for the coding queue.
 *
 * Highest suggestion_confidence first; rows with null/non-finite confidence
 * (no score → need cardholder follow-up) sink to the bottom as a distinct group.
 * Returns a NEW array — never mutates the input, which is the React Query cache
 * payload (mutating it would corrupt the per-user cache). Array.prototype.sort
 * is stable (ES2019+; the app targets es2023), so equal-confidence rows and the
 * null group keep their original server order.
 */
export function sortQueueByConfidence(
  rows: ExpenseCodingQueueRow[],
): ExpenseCodingQueueRow[] {
  return [...rows].sort((a, b) => {
    const ca = confidenceRatio(a.suggestion_confidence);
    const cb = confidenceRatio(b.suggestion_confidence);
    if (ca == null && cb == null) return 0; // both no-score: keep server order
    if (ca == null) return 1; // a (no score) sinks below b
    if (cb == null) return -1; // b (no score) sinks below a
    return cb - ca; // higher confidence first (equal → 0 keeps order)
  });
}

export interface ConfirmPayload {
  project_public_id: string;
  sub_cost_code_public_id: string;
  description: string;
  was_overridden: boolean;
}

export function buildConfirmPayload(
  projectPublicId: string,
  subCostCodePublicId: string,
  description: string,
  wasOverridden: boolean,
): ConfirmPayload {
  return {
    project_public_id: projectPublicId,
    sub_cost_code_public_id: subCostCodePublicId,
    description,
    was_overridden: wasOverridden,
  };
}

export interface ConfirmToast {
  message: string;
  kind: "success" | "error";
}

/**
 * Toast honesty for the confirm response: success ONLY when the api actually
 * enqueued the recode to QBO (`enqueued === true`); any other 2xx recorded
 * state without sending it, which must read as a failure to the operator.
 */
export function confirmResultToast(result: {
  enqueued?: boolean;
  reason?: string;
}): ConfirmToast {
  if (result.enqueued === true) {
    return { message: "Expense coding confirmed", kind: "success" };
  }
  return {
    message: `Coding recorded but NOT sent to QBO${result.reason ? ` — ${result.reason}` : ""}`,
    kind: "error",
  };
}

export function rowKey(row: ExpenseCodingQueueRow): string {
  return String(row.qbo_purchase_line_id);
}
