import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Send } from "lucide-react";
import { getList, getOne, post, put } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import { useToast } from "../../components/Toast";
import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import SubCostCodePickerSheet from "./SubCostCodePickerSheet";
import type {
  ContractLabor,
  ContractLaborLineItem,
  LookupProject,
  LookupSubCostCode,
  TimeEntry,
} from "../../types/api";

function fmtIsoDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : n ?? 0;
  if (isNaN(v)) return "$0.00";
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtHours(s: string | null | undefined): string {
  if (s === null || s === undefined || s === "") return "0.00h";
  const n = Number(s);
  if (isNaN(n)) return "0.00h";
  return `${n.toFixed(2)}h`;
}

function fmtTimeOfDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function abbrev(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "—";
}

/**
 * Per-line user edits. All fields are OPTIONAL — only fields the user has
 * touched have entries. Untouched fields fall back to the raw server value
 * at save time so we don't silently round-trip-truncate decimals beyond
 * what the user actually typed (review-workflow finding #1, #2, #9).
 */
interface LineEdit {
  sub_cost_code_id?: number | null;
  is_billable?: boolean;
  is_overhead?: boolean;
  description?: string;
  /** hours, as typed (decimal string). "" means user cleared the field. */
  hours?: string;
  /** dollars per hour, as typed. "" means user cleared the field. */
  rate?: string;
  /** percentage as typed (e.g. "50" for 0.50 fraction); converted on save. */
  markup_pct?: string;
}

/** Display formatter — 2-decimal pad for the input boxes. Save path never
 *  reads this value, so the rounding is purely cosmetic. */
function decimalToDisplayString(v: string | null): string {
  if (v === null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

/** Display formatter for markup — converts fraction (0.50) to percent
 *  string ("50"). Used only for the input value. Save path preserves the
 *  original fraction when the field is untouched. */
function markupToPctDisplayString(markup: string | null): string {
  if (markup === null || markup === "") return "";
  const n = Number(markup);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 10000) / 100);
}

/** Strict non-negative number parse for *display* math. Negatives and
 *  non-finites clamp to 0 (review-workflow finding #8). */
function parseOrZero(s: string): number {
  if (s === "") return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/** Reject negative or non-finite input at the field level — keeps any
 *  pasted-garbage / scientific-notation overflow / typed-minus from
 *  reaching state or the save payload. */
function inputRejectsNegative(v: string): boolean {
  if (v === "") return false;
  const n = Number(v);
  return !Number.isFinite(n) || n < 0;
}

function computeAmount(hours: number, rate: number): number {
  return hours * rate;
}

function computePrice(hours: number, rate: number, markupFraction: number): number {
  return hours * rate * (1 + markupFraction);
}

export default function LaborReviewScreen() {
  const { public_id } = useParams<{ public_id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: lookups } = useLookups("projects,sub_cost_codes");

  const projectMap = useMemo(() => {
    const m = new Map<number, string>();
    (lookups.projects ?? []).forEach((p: LookupProject) => m.set(p.id, p.name ?? ""));
    return m;
  }, [lookups.projects]);

  const sccMap = useMemo(() => {
    const m = new Map<number, LookupSubCostCode>();
    (lookups.sub_cost_codes ?? []).forEach((s: LookupSubCostCode) => m.set(s.id, s));
    return m;
  }, [lookups.sub_cost_codes]);

  const clQuery = useQuery<ContractLabor>({
    queryKey: ["contract-labor", public_id],
    queryFn: () => getOne<ContractLabor>(`/api/v1/contract-labor/${public_id}`),
    enabled: !!public_id,
  });

  const linesQuery = useQuery<ContractLaborLineItem[]>({
    queryKey: ["contract-labor", public_id, "line-items"],
    queryFn: async () =>
      (await getList<ContractLaborLineItem>(`/api/v1/contract-labor/${public_id}/line-items`)).data,
    enabled: !!public_id,
  });

  const sourceTeQuery = useQuery<TimeEntry>({
    queryKey: ["time-entry", clQuery.data?.source_time_entry_public_id],
    queryFn: () =>
      getOne<TimeEntry>(`/api/v1/time-entries/${clQuery.data?.source_time_entry_public_id}`),
    enabled: !!clQuery.data?.source_time_entry_public_id,
  });

  // edits is intentionally sparse — only fields the user has touched have
  // entries. Initial render and refetches do NOT seed edits, so untouched
  // fields preserve the raw server precision through the save path.
  const [edits, setEdits] = useState<Map<string, LineEdit>>(new Map());
  const [pickingForLineId, setPickingForLineId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);

  const effectiveLines = useMemo(
    () =>
      (linesQuery.data ?? []).map((li) => {
        const e = edits.get(li.public_id);
        const hoursStr = e?.hours ?? decimalToDisplayString(li.hours);
        const rateStr = e?.rate ?? decimalToDisplayString(li.rate);
        const markupPctStr = e?.markup_pct ?? markupToPctDisplayString(li.markup);
        const hoursNum = parseOrZero(hoursStr);
        const rateNum = parseOrZero(rateStr);
        const markupFraction = parseOrZero(markupPctStr) / 100;
        const computedAmount = computeAmount(hoursNum, rateNum);
        const computedPrice = computePrice(hoursNum, rateNum, markupFraction);
        return {
          ...li,
          sub_cost_code_id: e?.sub_cost_code_id !== undefined ? e.sub_cost_code_id : li.sub_cost_code_id,
          is_billable: e?.is_billable ?? li.is_billable,
          is_overhead: e?.is_overhead ?? li.is_overhead,
          description: e?.description ?? li.description ?? "",
          hours_str: hoursStr,
          rate_str: rateStr,
          markup_pct_str: markupPctStr,
          computed_amount: computedAmount,
          computed_price: computedPrice,
          /** Track per-field dirtiness so the save path can preserve raw
           *  server precision on untouched fields. */
          dirty_hours: e?.hours !== undefined,
          dirty_rate: e?.rate !== undefined,
          dirty_markup: e?.markup_pct !== undefined,
        };
      }),
    [linesQuery.data, edits],
  );

  const missingSCC = effectiveLines.some((li) => li.is_billable && li.sub_cost_code_id === null);
  const missingHoursOrRate = effectiveLines.some(
    (li) => li.is_billable && (li.hours_str === "" || li.rate_str === ""),
  );
  const isReady = !missingSCC && !missingHoursOrRate && effectiveLines.length > 0;

  // Header totals are scoped to BILLABLE lines so the "X hours · $Y" pair
  // reconciles for the reviewer. Non-billable line hours are still shown
  // on the per-line cards but excluded from the header summary
  // (review-workflow finding #4).
  const totalHoursBillable = useMemo(
    () =>
      effectiveLines.reduce(
        (sum, li) => (li.is_billable ? sum + parseOrZero(li.hours_str) : sum),
        0,
      ),
    [effectiveLines],
  );

  const totalAmount = useMemo(
    () =>
      effectiveLines.reduce((sum, li) => {
        if (!li.is_billable) return sum;
        return sum + li.computed_price;
      }, 0),
    [effectiveLines],
  );

  const updateLine = (lineId: string, patch: LineEdit) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(lineId) ?? {};
      next.set(lineId, { ...current, ...patch });
      return next;
    });
  };

  /** Build the line-items payload. For decimal fields (hours/rate/markup),
   *  prefer the RAW server value when the user didn't edit that field —
   *  this preserves arbitrary decimal precision instead of round-tripping
   *  through toFixed(2) display rounding (review-workflow findings #1/#2/#9).
   *  Negative values are clamped to 0 as a defense-in-depth measure
   *  alongside the input-level rejection (finding #8). */
  const buildLineItemsPayload = () =>
    effectiveLines.map((li) => {
      const hoursForSave = li.dirty_hours
        ? li.hours_str === ""
          ? null
          : Math.max(0, Number(li.hours_str))
        : li.hours === null || li.hours === ""
        ? null
        : Math.max(0, Number(li.hours));
      const rateForSave = li.dirty_rate
        ? li.rate_str === ""
          ? null
          : Math.max(0, Number(li.rate_str))
        : li.rate === null || li.rate === ""
        ? null
        : Math.max(0, Number(li.rate));
      const markupForSave = li.dirty_markup
        ? li.markup_pct_str === ""
          ? null
          : Math.max(0, Number(li.markup_pct_str) / 100)
        : li.markup === null || li.markup === ""
        ? null
        : Math.max(0, Number(li.markup));
      return {
        id: li.id,
        public_id: li.public_id,
        row_version: li.row_version,
        line_date: li.line_date,
        project_id: li.is_overhead ? null : li.project_id,
        sub_cost_code_id: li.sub_cost_code_id,
        description: li.description.trim() || null,
        hours: hoursForSave,
        rate: rateForSave,
        markup: markupForSave,
        price: Number(li.computed_price.toFixed(2)),
        is_billable: li.is_billable,
        is_overhead: li.is_overhead,
      };
    });

  /** Refetch the parent ContractLabor + its line items so a subsequent
   *  PUT/POST sees the latest row_versions. Used after every PUT — both
   *  on success (before the follow-up POST in handleSubmitForReview) and
   *  on failure (so a retry doesn't 409 on the bumped row_version). */
  const refreshFromServer = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["contract-labor", public_id] }),
      queryClient.refetchQueries({
        queryKey: ["contract-labor", public_id, "line-items"],
      }),
    ]);
  };

  const handleSubmitForReview = async () => {
    if (!clQuery.data || submittingReview || saving) return;
    if (effectiveLines.length === 0) return;
    const msg =
      `Submit ${clQuery.data.employee_name}'s line items for review? Reviewers will be notified.`;
    if (!confirm(msg)) return;
    setSubmittingReview(true);
    let putSucceeded = false;
    try {
      // Persist current edits so reviewers see the latest values.
      // bill_vendor_id / bill_date / due_date / bill_number are deliberately
      // null'd — those are derived by the downstream Generate Bills flow,
      // never set on this screen (legacy ContractLaborEdit:339-345 noted
      // the same intent).
      await put(`/api/v1/contract-labor/${public_id}/bill`, {
        row_version: clQuery.data.row_version,
        bill_vendor_id: null,
        bill_date: null,
        due_date: null,
        bill_number: null,
        status: undefined,
        line_items: buildLineItemsPayload(),
      });
      putSucceeded = true;
      // Refresh local caches so the follow-up POST (and any retry) sees
      // the bumped parent row_version.
      await refreshFromServer();
      await post(`/api/v1/submit/review/contract-labor/${public_id}`, {
        comments: null,
      });
      toast("Submitted for review", "success");
      queryClient.invalidateQueries({ queryKey: ["contract-labor"] });
      navigate(-1);
    } catch (err) {
      console.error("Submit for review failed", err);
      // If the PUT succeeded but the POST failed, the edits are persisted
      // but the review request didn't start. Refresh state so a retry
      // uses fresh row_versions, and surface a more specific message.
      if (putSucceeded) {
        await refreshFromServer().catch(() => undefined);
        toast(
          "Edits were saved, but the review request didn't start. Tap Submit again to retry.",
          "error",
        );
      } else {
        await refreshFromServer().catch(() => undefined);
        toast(err instanceof Error ? err.message : "Submit for review failed", "error");
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleMarkReady = async () => {
    if (!isReady || !clQuery.data || saving) return;
    const msg =
      `Mark ${clQuery.data.employee_name} ready for billing? Once ready, line items can no longer be edited from this screen.`;
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      // bill_vendor_id / bill_date / due_date / bill_number are deliberately
      // null'd — derived downstream by Generate Bills (legacy parity).
      await put(`/api/v1/contract-labor/${public_id}/bill`, {
        row_version: clQuery.data.row_version,
        bill_vendor_id: null,
        bill_date: null,
        due_date: null,
        bill_number: null,
        status: "ready",
        line_items: buildLineItemsPayload(),
      });
      toast("Marked ready for billing", "success");
      queryClient.invalidateQueries({ queryKey: ["contract-labor"] });
      navigate(-1);
    } catch (err) {
      console.error("Mark ready failed", err);
      // Refresh state so a retry doesn't 409 on the (possibly) bumped
      // row_version.
      await refreshFromServer().catch(() => undefined);
      toast(err instanceof Error ? err.message : "Mark ready failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (clQuery.isLoading || !clQuery.data) {
    return (
      <div className="ios-page">
        <NavHeader title="Review" onBack={() => navigate(-1)} />
        <div className="page-loading">Loading…</div>
      </div>
    );
  }

  const cl = clQuery.data;
  const headerMeta = `${fmtIsoDate(cl.work_date)} · ${totalHoursBillable.toFixed(2)}h billable · ${fmtMoney(totalAmount)}`;

  return (
    <>
      <div className="ios-page">
        <NavHeader title="Review" onBack={() => navigate(-1)} />

        <div className="entry-edit-header">
          <div className="entry-edit-tile">{abbrev(cl.employee_name ?? "—")}</div>
          <div>
            <div className="entry-edit-title">{cl.employee_name ?? "Unknown worker"}</div>
            <div className="entry-edit-meta">{headerMeta}</div>
          </div>
        </div>

        {cl.source_time_entry_public_id && (
          <SectionCard header="Time logs">
            {sourceTeQuery.isLoading && (
              <div className="time-row">
                <span className="time-row-label">Loading source logs…</span>
              </div>
            )}
            {sourceTeQuery.data?.time_logs?.map((log) => {
              const projectName = log.project_id
                ? projectMap.get(log.project_id) ?? "Unknown project"
                : log.log_type === "break"
                ? "Break"
                : "No project";
              const range = log.clock_out
                ? `${fmtTimeOfDay(log.clock_in)} — ${fmtTimeOfDay(log.clock_out)}`
                : `${fmtTimeOfDay(log.clock_in)} — ongoing`;
              const note = log.note?.trim() || undefined;
              return (
                <ListRow
                  key={log.public_id}
                  title={projectName}
                  subtitle={note ? `${range} · ${note}` : range}
                  value={fmtHours(log.duration)}
                />
              );
            })}
          </SectionCard>
        )}

        <div className="section-card-header">Line items</div>
        {effectiveLines.length === 0 && (
          <SectionCard>
            <div className="time-row">
              <span className="time-row-label">No line items.</span>
            </div>
          </SectionCard>
        )}
        {effectiveLines.map((li, idx) => {
          const projectName = li.is_overhead
            ? "Overhead"
            : li.project_id
            ? projectMap.get(li.project_id) ?? "Unknown project"
            : "No project";
          const sccLabel =
            li.sub_cost_code_id !== null
              ? (() => {
                  const scc = sccMap.get(li.sub_cost_code_id);
                  return scc ? `${scc.number} · ${scc.name}` : `#${li.sub_cost_code_id}`;
                })()
              : "Pick sub cost code";
          return (
            <SectionCard
              key={li.public_id}
              header={`Line ${idx + 1} · ${projectName}`}
            >
              <div className="time-row">
                <label className="time-row-label" htmlFor={`hours-${li.public_id}`}>Hours</label>
                <input
                  id={`hours-${li.public_id}`}
                  className="time-row-input"
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  min="0"
                  max="24"
                  value={li.hours_str}
                  onChange={(e) => {
                    if (inputRejectsNegative(e.target.value)) return;
                    updateLine(li.public_id, { hours: e.target.value });
                  }}
                />
              </div>
              <div className="time-row">
                <label className="time-row-label" htmlFor={`rate-${li.public_id}`}>Rate ($/hr)</label>
                <input
                  id={`rate-${li.public_id}`}
                  className="time-row-input"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={li.rate_str}
                  onChange={(e) => {
                    if (inputRejectsNegative(e.target.value)) return;
                    updateLine(li.public_id, { rate: e.target.value });
                  }}
                />
              </div>
              <div className="time-row">
                <span className="time-row-label">Amount</span>
                <span className="time-row-label" style={{ color: "var(--color-text-muted)" }}>
                  {fmtMoney(li.computed_amount)}
                </span>
              </div>
              <div className="time-row">
                <label className="time-row-label" htmlFor={`markup-${li.public_id}`}>Markup (%)</label>
                <input
                  id={`markup-${li.public_id}`}
                  className="time-row-input"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={li.markup_pct_str}
                  onChange={(e) => {
                    if (inputRejectsNegative(e.target.value)) return;
                    updateLine(li.public_id, { markup_pct: e.target.value });
                  }}
                />
              </div>
              <div className="time-row">
                <span className="time-row-label">Price</span>
                <span className="time-row-label" style={{ color: "var(--color-text)" }}>
                  {fmtMoney(li.computed_price)}
                </span>
              </div>
              <button
                type="button"
                className="list-row list-row-link"
                onClick={() => setPickingForLineId(li.public_id)}
                disabled={!li.is_billable}
              >
                <div className="list-row-content">
                  <div className="list-row-title">Sub cost code</div>
                </div>
                <div className="list-row-trailing">
                  <span className="list-row-value">{sccLabel}</span>
                  <ChevronRight size={18} strokeWidth={2} className="list-row-chevron" />
                </div>
              </button>
              <div className="description-area">
                <label className="description-area-label" htmlFor={`desc-${li.public_id}`}>
                  Description
                </label>
                <textarea
                  id={`desc-${li.public_id}`}
                  value={li.description}
                  onChange={(e) => updateLine(li.public_id, { description: e.target.value })}
                  placeholder="What was done?"
                />
              </div>
              <ListRow
                title="Billable"
                toggleValue={li.is_billable}
                onToggleChange={(v) => updateLine(li.public_id, { is_billable: v })}
              />
              <ListRow
                title="Overhead"
                toggleValue={li.is_overhead}
                onToggleChange={(v) => updateLine(li.public_id, { is_overhead: v })}
              />
            </SectionCard>
          );
        })}

        {(missingSCC || missingHoursOrRate) && (
          <div className="validation-banner">
            <AlertTriangle size={16} strokeWidth={2} />
            <span>
              {missingHoursOrRate
                ? "Every billable line item needs both Hours and Rate before this can be marked ready."
                : "Every billable line item needs a sub cost code before this can be marked ready."}
            </span>
          </div>
        )}

        {cl.status === "pending_review" && (
          <>
            <button
              type="button"
              className="submit-button"
              onClick={handleSubmitForReview}
              disabled={submittingReview || saving || effectiveLines.length === 0}
            >
              <Send size={16} strokeWidth={2} />
              <span>{submittingReview ? "Submitting…" : "Submit for review"}</span>
            </button>
            <button
              type="button"
              className="submit-button"
              onClick={handleMarkReady}
              disabled={!isReady || saving || submittingReview}
            >
              <Send size={16} strokeWidth={2} />
              <span>{saving ? "Saving…" : "Mark ready for billing"}</span>
            </button>
          </>
        )}
      </div>

      <SubCostCodePickerSheet
        open={pickingForLineId !== null}
        onDismiss={() => setPickingForLineId(null)}
        onSelect={(scc) => {
          if (pickingForLineId) {
            updateLine(pickingForLineId, { sub_cost_code_id: scc.id });
          }
          setPickingForLineId(null);
        }}
      />
    </>
  );
}
