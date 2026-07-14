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

export function formatSuggestionHelper(
  reason: string | null | undefined,
  confidence: number | string | null | undefined,
): string | null {
  if (!reason && confidence == null) return null;
  let conf: string | null = null;
  if (typeof confidence === "number") {
    // A ratio (<=1) scales to a percent; a value already in percent passes through.
    const pct = confidence <= 1 ? confidence * 100 : confidence;
    conf = `${Math.round(pct)}%`;
  } else if (confidence != null) {
    conf = String(confidence);
  }
  if (reason && conf) return `${reason} · ${conf}`;
  return reason ?? conf;
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

export function rowKey(row: ExpenseCodingQueueRow): string {
  return String(row.qbo_purchase_line_id);
}
