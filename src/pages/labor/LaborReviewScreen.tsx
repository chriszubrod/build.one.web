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
      });
    });
    setEdits(next);
  }, [linesQuery.data]);

  const effectiveLines = useMemo(
    () =>
      (linesQuery.data ?? []).map((li) => {
        const e = edits.get(li.public_id);
        return {
          ...li,
          sub_cost_code_id: e?.sub_cost_code_id ?? li.sub_cost_code_id,
          is_billable: e?.is_billable ?? li.is_billable,
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
        return sum + Number(li.price ?? 0);
      }, 0),
    [effectiveLines],
  );

  const updateLine = (lineId: string, patch: Partial<LineEdit>) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(lineId) ?? { sub_cost_code_id: null, is_billable: true };
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
        line_items: effectiveLines.map((li) => ({
          id: li.id,
          public_id: li.public_id,
          row_version: li.row_version,
          line_date: li.line_date,
          project_id: li.project_id,
          sub_cost_code_id: li.sub_cost_code_id,
          description: li.description,
          hours: li.hours !== null ? Number(li.hours) : null,
          rate: li.rate !== null ? Number(li.rate) : null,
          markup: li.markup !== null ? Number(li.markup) : null,
          price: li.price !== null ? Number(li.price) : null,
          is_billable: li.is_billable,
          is_overhead: li.is_overhead,
        })),
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

        <SectionCard header="Line items">
          {effectiveLines.length === 0 && (
            <div className="time-row">
              <span className="time-row-label">No line items.</span>
            </div>
          )}
          {effectiveLines.map((li) => {
            const projectName = li.project_id
              ? projectMap.get(li.project_id) ?? "Unknown project"
              : "Overhead";
            const sccLabel =
              li.sub_cost_code_id !== null
                ? (() => {
                    const scc = sccMap.get(li.sub_cost_code_id);
                    return scc ? `${scc.number} · ${scc.name}` : `#${li.sub_cost_code_id}`;
                  })()
                : "Pick sub cost code";
            return (
              <div key={li.public_id}>
                <div className="time-row">
                  <span className="time-row-label">{projectName}</span>
                  <span className="time-row-label" style={{ color: "var(--color-text-muted)" }}>
                    {fmtHours(li.hours)} · {fmtMoney(li.price)}
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
                <ListRow
                  title="Billable"
                  toggleValue={li.is_billable}
                  onToggleChange={(v) => updateLine(li.public_id, { is_billable: v })}
                />
              </div>
            );
          })}
        </SectionCard>

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
