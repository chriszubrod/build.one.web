import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Send } from "lucide-react";
import { getList, getOne, put } from "../../api/client";
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

interface LineEdit {
  sub_cost_code_id: number | null;
  is_billable: boolean;
  is_overhead: boolean;
  description: string;
  /** dollars, as typed (string keeps the input controllable) */
  rate: string;
  /** percentage as typed (e.g. "50" for 0.50); converted on save */
  markup_pct: string;
}

function rateToString(rate: string | null): string {
  if (rate === null || rate === "") return "";
  const n = Number(rate);
  if (isNaN(n)) return "";
  return n.toFixed(2);
}

function markupToPctString(markup: string | null): string {
  if (markup === null || markup === "") return "";
  const n = Number(markup);
  if (isNaN(n)) return "";
  return String(Math.round(n * 10000) / 100);
}

function computePrice(hours: number, rate: number, markupFraction: number): number {
  if (isNaN(hours) || isNaN(rate)) return 0;
  const m = isNaN(markupFraction) ? 0 : markupFraction;
  return hours * rate * (1 + m);
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

  const [edits, setEdits] = useState<Map<string, LineEdit>>(new Map());
  const [pickingForLineId, setPickingForLineId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = new Map<string, LineEdit>();
    (linesQuery.data ?? []).forEach((li) => {
      next.set(li.public_id, {
        sub_cost_code_id: li.sub_cost_code_id,
        is_billable: li.is_billable,
        is_overhead: li.is_overhead,
        description: li.description ?? "",
        rate: rateToString(li.rate),
        markup_pct: markupToPctString(li.markup),
      });
    });
    setEdits(next);
  }, [linesQuery.data]);

  const effectiveLines = useMemo(
    () =>
      (linesQuery.data ?? []).map((li) => {
        const e = edits.get(li.public_id);
        const rateNum = e ? Number(e.rate) : Number(li.rate);
        const markupFraction = e
          ? (e.markup_pct === "" ? 0 : Number(e.markup_pct) / 100)
          : Number(li.markup ?? 0);
        const hoursNum = Number(li.hours ?? 0);
        const computedPrice = computePrice(hoursNum, rateNum, markupFraction);
        return {
          ...li,
          sub_cost_code_id: e?.sub_cost_code_id ?? li.sub_cost_code_id,
          is_billable: e?.is_billable ?? li.is_billable,
          is_overhead: e?.is_overhead ?? li.is_overhead,
          description: e?.description ?? li.description ?? "",
          rate_str: e?.rate ?? rateToString(li.rate),
          markup_pct_str: e?.markup_pct ?? markupToPctString(li.markup),
          computed_price: computedPrice,
        };
      }),
    [linesQuery.data, edits],
  );

  const missingSCC = effectiveLines.some((li) => li.is_billable && li.sub_cost_code_id === null);
  const isReady = !missingSCC && effectiveLines.length > 0;

  const totalAmount = useMemo(
    () =>
      effectiveLines.reduce((sum, li) => {
        if (!li.is_billable) return sum;
        return sum + li.computed_price;
      }, 0),
    [effectiveLines],
  );

  const updateLine = (lineId: string, patch: Partial<LineEdit>) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(lineId) ?? {
        sub_cost_code_id: null,
        is_billable: true,
        is_overhead: false,
        description: "",
        rate: "",
        markup_pct: "",
      };
      next.set(lineId, { ...current, ...patch });
      return next;
    });
  };

  const handleMarkReady = async () => {
    if (!isReady || !clQuery.data || saving) return;
    const msg =
      `Mark ${clQuery.data.employee_name} ready for billing? Once ready, line items can no longer be edited from this screen.`;
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      await put(`/api/v1/contract-labor/${public_id}/bill`, {
        row_version: clQuery.data.row_version,
        bill_vendor_id: null,
        bill_date: null,
        due_date: null,
        bill_number: null,
        status: "ready",
        line_items: effectiveLines.map((li) => {
          const rateNum = li.rate_str === "" ? null : Number(li.rate_str);
          const markupFraction =
            li.markup_pct_str === "" ? null : Number(li.markup_pct_str) / 100;
          return {
            id: li.id,
            public_id: li.public_id,
            row_version: li.row_version,
            line_date: li.line_date,
            project_id: li.is_overhead ? null : li.project_id,
            sub_cost_code_id: li.sub_cost_code_id,
            description: li.description.trim() || null,
            hours: li.hours !== null ? Number(li.hours) : null,
            rate: rateNum,
            markup: markupFraction,
            price: Number(li.computed_price.toFixed(2)),
            is_billable: li.is_billable,
            is_overhead: li.is_overhead,
          };
        }),
      });
      toast("Marked ready for billing", "success");
      queryClient.invalidateQueries({ queryKey: ["contract-labor"] });
      navigate(-1);
    } catch (err) {
      console.error("Mark ready failed", err);
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
  const headerMeta = `${fmtIsoDate(cl.work_date)} · ${fmtHours(cl.total_hours)} · ${fmtMoney(totalAmount)}`;

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
                <span className="time-row-label">Hours</span>
                <span className="time-row-label" style={{ color: "var(--color-text-muted)" }}>
                  {fmtHours(li.hours)}
                </span>
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
                  onChange={(e) => updateLine(li.public_id, { rate: e.target.value })}
                />
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
                  onChange={(e) => updateLine(li.public_id, { markup_pct: e.target.value })}
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

        {missingSCC && (
          <div className="validation-banner">
            <AlertTriangle size={16} strokeWidth={2} />
            <span>Every billable line item needs a sub cost code before this can be marked ready.</span>
          </div>
        )}

        {cl.status === "pending_review" && (
          <button
            type="button"
            className="submit-button"
            onClick={handleMarkReady}
            disabled={!isReady || saving}
          >
            <Send size={16} strokeWidth={2} />
            <span>{saving ? "Saving…" : "Mark ready for billing"}</span>
          </button>
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
