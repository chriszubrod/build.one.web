import { useCallback, useMemo, useState } from "react";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getList, getOne, post } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import { useToast } from "../../components/Toast";
import PageHeader from "../../components/PageHeader";
import MoneyCell from "../../components/MoneyCell";
import type {
  ExpenseCodingMetrics,
  ExpenseCodingQueueRow,
  ExpenseCodingSuggestResult,
  LookupProject,
  LookupSubCostCode,
} from "../../types/api";
import {
  buildConfirmPayload,
  codingStatusClass,
  codingStatusLabel,
  computeWasOverridden,
  confidenceTier,
  CONFIDENCE_TIER_LABELS,
  confirmResultToast,
  formatAutoClearedPct,
  formatConfidencePct,
  formatSuggestionHelper,
  initialSelectionFromRow,
  recodeWritesOff,
  rowKey,
  sortQueueByConfidence,
  type RowCodingSelection,
} from "./expenseCodingLogic";

const QUEUE_QUERY_KEY = ["expense-coding", "queue"] as const;
const METRICS_QUERY_KEY = ["expense-coding", "metrics"] as const;

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return v;
}

function sccLabel(scc: LookupSubCostCode): string {
  return `${scc.number} ${scc.name}`;
}

interface ConfirmResponse extends ExpenseCodingQueueRow {
  enqueued?: boolean;
  reason?: string;
}

export default function ExpenseCodingCockpit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: lookups, loading: lookupsLoading } = useLookups("projects,sub_cost_codes");

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, RowCodingSelection>>({});
  const [readOnlyKeys, setReadOnlyKeys] = useState<Set<string>>(() => new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const projects = lookups.projects ?? [];
  const subCostCodes = lookups.sub_cost_codes ?? [];

  const queueQuery = useQuery({
    queryKey: QUEUE_QUERY_KEY,
    queryFn: () => getList<ExpenseCodingQueueRow>("/api/v1/expense-coding/queue"),
  });

  const metricsQuery = useQuery({
    queryKey: METRICS_QUERY_KEY,
    queryFn: () => getOne<ExpenseCodingMetrics>("/api/v1/expense-coding/metrics"),
  });

  // Sort by suggestion confidence (highest first; null/no-suggestion sinks to a
  // distinct bottom group) so high-confidence rows surface for quick confirm.
  // sortQueueByConfidence returns a NEW array — the React Query cache payload is
  // never mutated. Memoized on the query data so unrelated re-renders (typing in
  // an expanded row, expand/collapse) don't re-sort.
  const rows = useMemo(
    () => sortQueueByConfidence(queueQuery.data?.data ?? []),
    [queueQuery.data?.data],
  );
  const metrics = metricsQuery.data;
  const writesOff = recodeWritesOff(metrics);

  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QUEUE_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: METRICS_QUERY_KEY });
  }, [queryClient]);

  const getSelection = useCallback(
    (row: ExpenseCodingQueueRow): RowCodingSelection => {
      const key = rowKey(row);
      return selections[key] ?? initialSelectionFromRow(row);
    },
    [selections],
  );

  const setSelection = useCallback((row: ExpenseCodingQueueRow, patch: Partial<RowCodingSelection>) => {
    const key = rowKey(row);
    setSelections((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? initialSelectionFromRow(row)), ...patch },
    }));
  }, []);

  const toggleExpanded = (row: ExpenseCodingQueueRow) => {
    const key = rowKey(row);
    // Do NOT seed selections[key] on expand — an entry means "the human edited
    // this row" (dirty). Un-edited rows fall back to initialSelectionFromRow(row)
    // in getSelection, so a queue refetch (e.g. after Generate suggestions)
    // always hydrates the freshest server suggestion instead of a frozen blank.
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    try {
      const result = await post<ExpenseCodingSuggestResult>("/api/v1/expense-coding/suggest", {});
      toast(
        `Processed ${result.processed}: ${result.suggested} suggested, ${result.flagged} flagged, ${result.remaining} remaining`,
        "success",
      );
      refreshAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Failed to generate suggestions";
      toast(msg, "error");
    } finally {
      setSuggesting(false);
    }
  };

  const handleConfirm = async (row: ExpenseCodingQueueRow) => {
    const key = rowKey(row);
    if (!row.coding_item_public_id) {
      toast("Coding item not ready — try refreshing the queue", "error");
      return;
    }

    const selection = getSelection(row);
    if (selection.projectId == null || selection.subCostCodeId == null) return;

    const project = projects.find((p) => p.id === selection.projectId);
    const scc = subCostCodes.find((s) => s.id === selection.subCostCodeId);
    if (!project || !scc) {
      toast("Selected project or sub cost code is no longer available", "error");
      return;
    }

    const wasOverridden = computeWasOverridden(selection, row);
    const body = buildConfirmPayload(
      project.public_id,
      scc.public_id,
      selection.description,
      wasOverridden,
    );

    setBusyKey(key);
    try {
      const result = await post<ConfirmResponse>(
        `/api/v1/expense-coding/${row.coding_item_public_id}/confirm`,
        body,
      );
      const resultToast = confirmResultToast(result);
      toast(resultToast.message, resultToast.kind);
      // A 2xx recorded server state either way — refresh so the row/counts
      // reflect it even when the enqueue didn't happen.
      refreshAll();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          toast("Blocked: recode writes are disabled — nothing was sent to QBO", "error");
          void queryClient.invalidateQueries({ queryKey: METRICS_QUERY_KEY });
        } else if (err.status === 409) {
          toast("Held by another reviewer — row is read-only", "error");
          setReadOnlyKeys((prev) => new Set(prev).add(key));
        } else {
          toast(err.detail, "error");
        }
      } else {
        toast("Failed to confirm coding", "error");
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleFlag = async (row: ExpenseCodingQueueRow) => {
    const key = rowKey(row);
    if (!row.coding_item_public_id) {
      toast("Coding item not ready — try refreshing the queue", "error");
      return;
    }

    const reason =
      window.prompt("Reason for flagging (optional):", "needs cardholder follow-up") ??
      "needs cardholder follow-up";
    if (!reason.trim()) return;

    setBusyKey(key);
    try {
      await post(`/api/v1/expense-coding/${row.coding_item_public_id}/flag`, {
        reason: reason.trim(),
      });
      toast("Flagged for follow-up", "success");
      refreshAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Failed to flag row";
      toast(msg, "error");
    } finally {
      setBusyKey(null);
    }
  };

  const loading = queueQuery.isLoading || metricsQuery.isLoading || lookupsLoading;
  const queryError = queueQuery.error ?? metricsQuery.error;
  const error = queryError instanceof Error ? queryError.message : null;

  const autoClearedLabel = metrics ? formatAutoClearedPct(metrics) : "—";

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page expense-coding-page">
      <PageHeader title="Expense" count={rows.length}>
        <span className="expense-coding-subtitle">58999 → SubCostCode</span>
      </PageHeader>

      {writesOff && (
        <div className="expense-coding-gate-banner">
          Recode writes are disabled — Confirm is blocked; nothing will be sent to QBO.
        </div>
      )}

      {metrics && (
        <div className="expense-coding-metrics">
          <MetricChip label="Total" value={metrics.total_target_lines} />
          <MetricChip label="Suggested" value={metrics.suggested_count} />
          <MetricChip label="Flagged" value={metrics.flagged_count} highlight={metrics.flagged_count > 0} />
          <MetricChip label="Written" value={metrics.written_count} />
          <MetricChip label="Auto-cleared" value={autoClearedLabel} />
          <div className="expense-coding-metrics-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={refreshAll}
              disabled={queueQuery.isFetching || metricsQuery.isFetching}
            >
              <RefreshCw size={14} aria-hidden />
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void handleSuggest()}
              disabled={suggesting}
            >
              <Sparkles size={14} aria-hidden />
              {suggesting ? "Generating…" : "Generate suggestions"}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="expense-coding-empty">
          <p>No expense lines in the coding queue.</p>
        </div>
      ) : (
        <ul className="expense-coding-queue">
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <QueueRowCard
                key={key}
                row={row}
                expanded={expandedKey === key}
                selection={getSelection(row)}
                projects={projects}
                subCostCodes={subCostCodes}
                readOnly={readOnlyKeys.has(key)}
                writesOff={writesOff}
                busy={busyKey === key}
                onToggle={() => toggleExpanded(row)}
                onSelectionChange={(patch) => setSelection(row, patch)}
                onConfirm={() => void handleConfirm(row)}
                onFlag={() => void handleFlag(row)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MetricChip({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className={`expense-coding-metric${highlight ? " expense-coding-metric--highlight" : ""}`}>
      <span className="expense-coding-metric-label">{label}</span>
      <span className="expense-coding-metric-value">{value}</span>
    </div>
  );
}

interface QueueRowCardProps {
  row: ExpenseCodingQueueRow;
  expanded: boolean;
  selection: RowCodingSelection;
  projects: LookupProject[];
  subCostCodes: LookupSubCostCode[];
  readOnly: boolean;
  writesOff: boolean;
  busy: boolean;
  onToggle: () => void;
  onSelectionChange: (patch: Partial<RowCodingSelection>) => void;
  onConfirm: () => void;
  onFlag: () => void;
}

function QueueRowCard({
  row,
  expanded,
  selection,
  projects,
  subCostCodes,
  readOnly,
  writesOff,
  busy,
  onToggle,
  onSelectionChange,
  onConfirm,
  onFlag,
}: QueueRowCardProps) {
  const canConfirm =
    !readOnly &&
    !writesOff &&
    selection.projectId != null &&
    selection.subCostCodeId != null &&
    Boolean(row.coding_item_public_id);

  const helperText = formatSuggestionHelper(row.suggestion_reason, row.suggestion_confidence);
  const memo = row.private_note?.trim() || row.line_description?.trim() || "—";
  const confTier = confidenceTier(row.suggestion_confidence);
  const confPct = formatConfidencePct(row.suggestion_confidence);

  return (
    <li className={`expense-coding-row${expanded ? " expense-coding-row--expanded" : ""}`}>
      <button type="button" className="expense-coding-row-summary" onClick={onToggle}>
        <div className="expense-coding-row-top">
          <span className="expense-coding-row-date">{fmtDate(row.txn_date)}</span>
          <span className="expense-coding-row-vendor">{row.vendor_name ?? "—"}</span>
          <span className="expense-coding-row-amount">
            <MoneyCell value={row.line_amount} />
          </span>
          <ChevronDown
            size={16}
            className={`expense-coding-row-chevron${expanded ? " expense-coding-row-chevron--open" : ""}`}
            aria-hidden
          />
        </div>
        <p className="expense-coding-row-memo">{memo}</p>
        <div className="expense-coding-row-badges">
          {row.credit && <span className="expense-coding-credit-chip">Credit</span>}
          <span
            className={`expense-coding-confidence-badge expense-coding-confidence-badge--${confTier}`}
          >
            {CONFIDENCE_TIER_LABELS[confTier]}
            {confPct ? ` · ${confPct}` : ""}
          </span>
          <span className={`status-badge ${codingStatusClass(row.coding_status)}`}>
            {codingStatusLabel(row.coding_status)}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="expense-coding-row-editor">
          {readOnly && (
            <p className="expense-coding-readonly-note">Held by another reviewer — read-only</p>
          )}
          {writesOff && (
            <p className="expense-coding-readonly-note">
              Recode writes are disabled — Confirm is blocked.
            </p>
          )}

          <label className="form-field">
            <span className="form-label">Project</span>
            <select
              className="form-select"
              value={selection.projectId ?? ""}
              disabled={readOnly || busy}
              onChange={(e) =>
                onSelectionChange({
                  projectId: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="form-label">Sub cost code</span>
            <select
              className="form-select"
              value={selection.subCostCodeId ?? ""}
              disabled={readOnly || busy}
              onChange={(e) =>
                onSelectionChange({
                  subCostCodeId: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">Select sub cost code…</option>
              {subCostCodes.map((scc) => (
                <option key={scc.id} value={scc.id}>
                  {sccLabel(scc)}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span className="form-label">Description</span>
            <input
              type="text"
              className="form-input"
              value={selection.description}
              disabled={readOnly || busy}
              onChange={(e) => onSelectionChange({ description: e.target.value })}
            />
          </label>

          {helperText && <p className="expense-coding-suggestion-helper">{helperText}</p>}

          <div className="expense-coding-row-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!canConfirm || busy}
              onClick={onConfirm}
            >
              Confirm
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={readOnly || busy || !row.coding_item_public_id}
              onClick={onFlag}
            >
              Flag
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
