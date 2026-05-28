import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError, del, getList, getOne, put } from "../../api/client";
import { useEntityList } from "../../hooks/useEntity";
import type {
  ContractLabor,
  ContractLaborDailySummary,
  ContractLaborLineItem,
  ContractLaborVendorConfig,
  Project,
  SubCostCode,
  TimeEntry,
  Vendor,
} from "../../types/api";

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  ready: "Ready",
  billed: "Billed",
};

const STATUS_CLASSES: Record<string, string> = {
  pending_review: "pending-review",
  ready: "ready",
  billed: "billed",
};

const MAX_DAILY_HOURS = 8;
const MR2_MARKUP_PERCENT = 5;

interface LineRow {
  // Server identity (null = new, unsaved row)
  id: number | null;
  public_id: string | null;
  row_version: string | null;
  // Editable fields (stored as strings so empty values don't get coerced to 0)
  line_date: string;
  project_id: string; // BIGINT as string, "" = none
  sub_cost_code_id: string;
  hours: string;
  rate: string;
  markup_percent: string; // displayed as %, converted to decimal on save
  is_billable: boolean;
  is_overhead: boolean;
  description: string;
}

function toNum(s: string): number {
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function computePrice(row: LineRow): number {
  const hours = toNum(row.hours);
  const rate = toNum(row.rate);
  const markup = toNum(row.markup_percent) / 100;
  return (hours / 8) * rate * (1 + markup);
}

function emptyRow(workDate: string): LineRow {
  return {
    id: null,
    public_id: null,
    row_version: null,
    line_date: workDate || "",
    project_id: "",
    sub_cost_code_id: "",
    hours: "",
    rate: "",
    markup_percent: "",
    is_billable: true,
    is_overhead: false,
    description: "",
  };
}

function fromServer(item: ContractLaborLineItem, fallbackDate: string): LineRow {
  const markupDecimal = item.markup != null ? Number(item.markup) : NaN;
  return {
    id: item.id,
    public_id: item.public_id,
    row_version: item.row_version,
    line_date: item.line_date || fallbackDate || "",
    project_id: item.project_id != null ? String(item.project_id) : "",
    sub_cost_code_id: item.sub_cost_code_id != null ? String(item.sub_cost_code_id) : "",
    hours: item.hours ?? "",
    rate: item.rate ?? "",
    markup_percent: isFinite(markupDecimal) ? String(markupDecimal * 100) : "",
    is_billable: item.is_billable !== false,
    is_overhead: item.is_overhead === true,
    description: item.description ?? "",
  };
}

function fmtHHMM(decHours: string | null | number): string {
  const n = Number(decHours ?? 0);
  if (!isFinite(n)) return "00:00";
  const h = Math.trunc(n);
  const m = Math.round((n - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// API time format "YYYY-MM-DD HH:MM:SS[.fff]" → "h:mm A" via Date.
function fmtClockTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T"));
  if (isNaN(d.getTime())) return v;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtShortDate(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : v;
}

export default function ContractLaborEdit() {
  const { id: publicId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [entry, setEntry] = useState<ContractLabor | null>(null);
  const [rowVersion, setRowVersion] = useState<string>("");
  const [billVendorId, setBillVendorId] = useState<string>("");
  const [billNumber, setBillNumber] = useState<string>("");
  const [billDate, setBillDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ tone: "success" | "error"; msg: string } | null>(null);

  // Lookups
  const { items: vendors } = useEntityList<Vendor>("/api/v1/get/vendors");
  const { items: projects } = useEntityList<Project>("/api/v1/get/projects");
  const { items: subCostCodes } = useEntityList<SubCostCode>("/api/v1/get/sub-cost-codes");

  const sortedVendors = useMemo(
    () => [...vendors].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [vendors],
  );
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects],
  );
  const sortedSubCostCodes = useMemo(
    () => [...subCostCodes].sort((a, b) => a.number.localeCompare(b.number, undefined, { sensitivity: "base", numeric: true })),
    [subCostCodes],
  );
  const projectById = useMemo(() => {
    const m = new Map<number, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  // Daily-summary + vendor-config queries
  const dailySummaryQuery = useQuery<ContractLaborDailySummary>({
    queryKey: ["cl-daily-summary", publicId],
    queryFn: () => getOne<ContractLaborDailySummary>(`/api/v1/contract-labor/${publicId}/daily-summary`),
    enabled: Boolean(publicId),
  });
  const vendorConfigQuery = useQuery<ContractLaborVendorConfig>({
    queryKey: ["cl-vendor-config"],
    queryFn: () => getOne<ContractLaborVendorConfig>("/api/v1/contract-labor/vendor-config"),
  });

  // Source TimeEntry — fetched only when the row was aggregated from
  // TimeTracking (Excel-imported rows have source_time_entry_public_id = null).
  // Used to render the "Time Log Details" section with per-log clock-in/out.
  const sourceTimeEntryPublicId = entry?.source_time_entry_public_id ?? null;
  const sourceTimeEntryQuery = useQuery<TimeEntry>({
    queryKey: ["cl-source-time-entry", sourceTimeEntryPublicId],
    queryFn: () => getOne<TimeEntry>(`/api/v1/time-entries/${sourceTimeEntryPublicId}`),
    enabled: Boolean(sourceTimeEntryPublicId),
  });

  // Initial load: entry + line items
  useEffect(() => {
    if (!publicId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    (async () => {
      try {
        const e = await getOne<ContractLabor>(`/api/v1/contract-labor/${publicId}`);
        const items = await getList<ContractLaborLineItem>(`/api/v1/contract-labor/${publicId}/line-items`);
        if (cancelled) return;
        setEntry(e);
        setRowVersion(e.row_version);
        setBillVendorId(e.bill_vendor_id != null ? String(e.bill_vendor_id) : "");
        setBillNumber(e.bill_number ?? "");
        setBillDate(e.bill_date ?? "");
        setDueDate(e.due_date ?? "");
        const mapped = items.data.map((li) => fromServer(li, e.work_date));
        setLines(mapped.length > 0 ? mapped : [emptyRow(e.work_date)]);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.detail : "Failed to load entry");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  // Vendor → rate + markup defaults from VENDOR_CONFIG
  const vendorDefaults = useMemo(() => {
    if (!billVendorId || !vendorConfigQuery.data) return null;
    const v = vendors.find((x) => String(x.id) === billVendorId);
    if (!v) return null;
    const cfg = vendorConfigQuery.data[v.name];
    if (!cfg) return null;
    return {
      rate: cfg.rate ?? "",
      markupPercent: cfg.markup != null ? String(Number(cfg.markup) * 100) : "",
    };
  }, [billVendorId, vendorConfigQuery.data, vendors]);

  // When vendor changes, fill rate/markup on EMPTY lines only
  useEffect(() => {
    if (!vendorDefaults) return;
    setLines((prev) =>
      prev.map((row) => ({
        ...row,
        rate: row.rate === "" && vendorDefaults.rate ? vendorDefaults.rate : row.rate,
        markup_percent:
          row.markup_percent === "" && vendorDefaults.markupPercent ? vendorDefaults.markupPercent : row.markup_percent,
      })),
    );
  }, [vendorDefaults]);

  // Aggregates
  const allocatedThisEntry = useMemo(
    () => lines.reduce((sum, r) => sum + toNum(r.hours), 0),
    [lines],
  );
  const totalPrice = useMemo(
    () => lines.reduce((sum, r) => sum + computePrice(r), 0),
    [lines],
  );
  const allocatedOther = dailySummaryQuery.data?.allocated_other_entries ?? 0;
  const remaining8h = MAX_DAILY_HOURS - allocatedOther - allocatedThisEntry;
  const importedHours = Number(entry?.total_hours ?? 0);

  let allocationWarning: { tone: "success" | "info" | "warn" | "error"; msg: string } | null = null;
  if (lines.length > 0) {
    if (remaining8h < -0.01) {
      allocationWarning = { tone: "error", msg: `Over-allocated by ${Math.abs(remaining8h).toFixed(2)} hours (exceeds 8-hour day).` };
    } else if (allocatedThisEntry > importedHours + 0.01 && importedHours > 0) {
      allocationWarning = { tone: "warn", msg: `This entry's allocation (${allocatedThisEntry.toFixed(2)}) exceeds its imported hours (${importedHours.toFixed(2)}).` };
    } else if (remaining8h > 0.01) {
      allocationWarning = { tone: "info", msg: `${remaining8h.toFixed(2)} hours remaining to reach 8-hour day.` };
    } else {
      allocationWarning = { tone: "success", msg: "8-hour day fully allocated." };
    }
  }

  function updateLine(index: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...patch };
      // Overhead toggle clears the project FK and disables the dropdown
      if (patch.is_overhead === true) next.project_id = "";
      // MR2* project → auto-set markup to 5% (preserves Jinja behavior)
      if (patch.project_id !== undefined && patch.project_id !== "") {
        const p = projectById.get(Number(patch.project_id));
        const abbr = (p?.abbreviation ?? "").trim().toUpperCase();
        if (abbr.startsWith("MR2")) {
          next.markup_percent = String(MR2_MARKUP_PERCENT);
        }
      }
      return next;
    }));
  }

  function addLine() {
    if (!entry) return;
    setLines((prev) => [
      ...prev,
      {
        ...emptyRow(entry.work_date),
        rate: vendorDefaults?.rate ?? "",
        markup_percent: vendorDefaults?.markupPercent ?? "",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function showStatus(tone: "success" | "error", msg: string, autoHideMs?: number) {
    setSaveStatus({ tone, msg });
    if (autoHideMs) {
      setTimeout(() => setSaveStatus((cur) => (cur && cur.msg === msg ? null : cur)), autoHideMs);
    }
  }

  function validateForMarkReady(): string | null {
    const missing: string[] = [];
    if (!billVendorId) missing.push("Vendor");
    if (!billDate) missing.push("Bill Date");
    if (!billNumber) missing.push("Bill Number");
    if (lines.length === 0) missing.push("At least one Line Item");
    if (missing.length > 0) return `Missing required fields: ${missing.join(", ")}`;
    return null;
  }

  async function save(markAsReady: boolean) {
    if (!entry || !publicId) return;
    if (markAsReady) {
      const err = validateForMarkReady();
      if (err) {
        showStatus("error", err);
        return;
      }
    }
    setSaving(true);
    setSaveStatus(null);

    const payload = {
      row_version: rowVersion,
      bill_vendor_id: billVendorId ? Number(billVendorId) : null,
      bill_date: billDate || null,
      due_date: dueDate || null,
      bill_number: billNumber || null,
      status: markAsReady ? "ready" : undefined,
      line_items: lines.map((row) => ({
        id: row.id,
        public_id: row.public_id,
        row_version: row.row_version,
        line_date: row.line_date || null,
        project_id: row.is_overhead ? null : row.project_id ? Number(row.project_id) : null,
        sub_cost_code_id: row.sub_cost_code_id ? Number(row.sub_cost_code_id) : null,
        description: row.description || null,
        hours: row.hours !== "" ? Number(row.hours) : null,
        rate: row.rate !== "" ? Number(row.rate) : null,
        markup: row.markup_percent !== "" ? Number(row.markup_percent) / 100 : null,
        price: Number(computePrice(row).toFixed(2)),
        is_billable: row.is_billable,
        is_overhead: row.is_overhead,
      })),
    };

    try {
      const res = await put<{ public_id: string; row_version: string }>(
        `/api/v1/contract-labor/${publicId}/bill`,
        payload,
      );
      setRowVersion(res.row_version);
      // Re-fetch line items so new rows pick up their server-assigned id + row_version
      const items = await getList<ContractLaborLineItem>(`/api/v1/contract-labor/${publicId}/line-items`);
      const mapped = items.data.map((li) => fromServer(li, entry.work_date));
      setLines(mapped.length > 0 ? mapped : [emptyRow(entry.work_date)]);
      dailySummaryQuery.refetch();
      if (markAsReady) {
        showStatus("success", "Saved and marked as ready.", 1500);
        setTimeout(() => navigate("/contract-labor/list"), 1500);
      } else {
        showStatus("success", "Saved successfully.", 3000);
      }
    } catch (err) {
      showStatus("error", err instanceof ApiError ? err.detail : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!publicId) return;
    if (!window.confirm("Delete this entry and all its line items? This cannot be undone.")) return;
    setSaving(true);
    try {
      await del(`/api/v1/contract-labor/${publicId}`);
      navigate("/contract-labor/list");
    } catch (err) {
      setSaving(false);
      showStatus("error", err instanceof ApiError ? err.detail : "Failed to delete");
    }
  }

  if (loading) return <div className="page-loading">Loading...</div>;
  if (loadError) return <div className="page-error">{loadError}</div>;
  if (!entry) return <div className="page-error">Entry not found.</div>;

  const isBilled = entry.status === "billed";
  const statusBadge = (
    <span className={`status-badge ${STATUS_CLASSES[entry.status] ?? ""}`}>
      {STATUS_LABELS[entry.status] ?? entry.status}
    </span>
  );

  return (
    <div className="page form-page-wide">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <h1 style={{ margin: 0 }}>Create Bill from Time Entry</h1>
          {statusBadge}
        </div>
        <Link to="/contract-labor/list" className="btn btn-secondary">
          Back to List
        </Link>
      </div>

      {saveStatus && (
        <div className={`cl-save-status cl-save-status-${saveStatus.tone}`}>{saveStatus.msg}</div>
      )}

      {/* Source info strip */}
      <div className="cl-edit-source">
        <span><strong>Source:</strong> {entry.source_file || "Manual"}</span>
        {entry.source_row && <span><strong>Row:</strong> {entry.source_row}</span>}
      </div>

      {/* Time Entry Details — read-only. Only the populated fields render;
          for iOS-fed rows (TimeTracking lineage) the Excel-only columns
          (Job, TimeIn, TimeOut, Break, Regular, Overtime) are null, so
          they're hidden. Per-log breakdown lives in the next section. */}
      <section className="cl-edit-section">
        <h3>
          Time Entry Details{" "}
          <span className="cl-section-badge">
            {sourceTimeEntryPublicId ? "From TimeTracking" : "From Import"}
          </span>
        </h3>
        <div className="cl-readonly-grid">
          {entry.work_date && <ReadOnlyItem label="Work Date" value={entry.work_date} />}
          {entry.employee_name && <ReadOnlyItem label="Worker Name" value={entry.employee_name} />}
          {entry.job_name && <ReadOnlyItem label="Job" value={entry.job_name} />}
          {entry.time_in && <ReadOnlyItem label="Time In" value={entry.time_in} />}
          {entry.time_out && <ReadOnlyItem label="Time Out" value={entry.time_out} />}
          {entry.break_time && <ReadOnlyItem label="Break" value={entry.break_time} />}
          {entry.regular_hours != null && (
            <ReadOnlyItem label="Regular Hours" value={Number(entry.regular_hours).toFixed(2)} />
          )}
          {entry.overtime_hours != null && (
            <ReadOnlyItem label="Overtime Hours" value={Number(entry.overtime_hours).toFixed(2)} />
          )}
          <ReadOnlyItem
            label="Total Hours"
            value={`${Number(entry.total_hours ?? 0).toFixed(2)} (${fmtHHMM(entry.total_hours)})`}
            highlight
          />
        </div>
        {entry.description && (
          <div className="cl-readonly-notes">
            <label>Notes from Import</label>
            <p>{entry.description}</p>
          </div>
        )}
      </section>

      {/* Time Log Details — only for TimeTracking-sourced rows. Pulls the
          per-log breakdown from the source TimeEntry so a reviewer can
          cross-check clock-in/out + break vs. what's been allocated below. */}
      {sourceTimeEntryPublicId && (
        <section className="cl-edit-section">
          <div className="cl-section-header">
            <h3>
              Time Log Details{" "}
              <span className="cl-section-badge">From TimeTracking</span>
            </h3>
            <Link
              to={`/time-entry/${sourceTimeEntryPublicId}`}
              className="btn btn-secondary btn-sm"
            >
              View Source TimeEntry
            </Link>
          </div>
          {sourceTimeEntryQuery.isLoading ? (
            <p className="text-muted">Loading logs…</p>
          ) : sourceTimeEntryQuery.error ? (
            <p className="cl-empty">
              Could not load source TimeEntry logs:{" "}
              {(sourceTimeEntryQuery.error as Error).message}
            </p>
          ) : (sourceTimeEntryQuery.data?.time_logs?.length ?? 0) === 0 ? (
            <p className="cl-empty">Source TimeEntry has no time logs.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th style={{ textAlign: "right" }}>Duration</th>
                  <th>Type</th>
                  <th>Project</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(sourceTimeEntryQuery.data?.time_logs ?? []).map((log) => {
                  const projectName =
                    log.project_id != null
                      ? sortedProjects.find((p) => p.id === log.project_id)?.name ?? `#${log.project_id}`
                      : "—";
                  return (
                    <tr key={log.public_id}>
                      <td>{fmtShortDate(log.clock_in)}</td>
                      <td>{fmtClockTime(log.clock_in)}</td>
                      <td>
                        {log.clock_out ? fmtClockTime(log.clock_out) : (
                          <em className="text-muted">still clocked in</em>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {log.duration != null
                          ? `${Number(log.duration).toFixed(2)} (${fmtHHMM(log.duration)})`
                          : "—"}
                      </td>
                      <td style={{ textTransform: "capitalize" }}>
                        {log.log_type ?? "—"}
                      </td>
                      <td>{projectName}</td>
                      <td>{log.note || <span className="text-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* Bill header */}
      <section className="cl-edit-section">
        <h3>Bill Information</h3>
        <div className="cl-form-row">
          <div className="cl-field">
            <label htmlFor="bill_vendor">Vendor <span className="required">*</span></label>
            <select
              id="bill_vendor"
              value={billVendorId}
              onChange={(e) => setBillVendorId(e.target.value)}
              disabled={isBilled}
            >
              <option value="">— Select Vendor —</option>
              {sortedVendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            {entry.employee_name && (
              <p className="cl-hint">Imported as: "{entry.employee_name}"</p>
            )}
          </div>
          <div className="cl-field">
            <label htmlFor="bill_number">Bill Number <span className="required">*</span></label>
            <input
              id="bill_number"
              type="text"
              value={billNumber}
              onChange={(e) => setBillNumber(e.target.value)}
              placeholder="e.g., CL-2026-001"
              disabled={isBilled}
            />
          </div>
        </div>
        <div className="cl-form-row">
          <div className="cl-field">
            <label htmlFor="bill_date">Bill Date <span className="required">*</span></label>
            <input
              id="bill_date"
              type="date"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
              disabled={isBilled}
            />
          </div>
          <div className="cl-field">
            <label htmlFor="due_date">Due Date</label>
            <input
              id="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isBilled}
            />
          </div>
        </div>
      </section>

      {/* Daily Hours Summary */}
      <section className="cl-edit-section cl-hours-summary">
        <h3>Daily Hours Summary for {entry.employee_name || "Worker"}</h3>
        <div className="cl-hours-grid">
          <HoursStat label="Work Date" value={entry.work_date || "N/A"} />
          <HoursStat
            label={`Daily Total (${dailySummaryQuery.data?.entry_count ?? 0})`}
            value={(dailySummaryQuery.data?.total_imported_hours ?? 0).toFixed(2)}
          />
          <HoursStat label="Allocated (other entries)" value={allocatedOther.toFixed(2)} />
          <HoursStat label="This Entry" value={allocatedThisEntry.toFixed(2)} />
          <HoursStat
            label="Remaining (vs 8h day)"
            value={remaining8h.toFixed(2)}
            tone={remaining8h < -0.01 ? "over" : remaining8h <= 0.01 ? "ok" : undefined}
          />
        </div>
        {allocationWarning && (
          <div className={`cl-hours-warning cl-hours-${allocationWarning.tone}`}>
            {allocationWarning.msg}
          </div>
        )}
      </section>

      {/* Line items */}
      <section className="cl-edit-section">
        <div className="cl-section-header">
          <h3>Line Items</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLine} disabled={isBilled}>
            + Add Line Item
          </button>
        </div>
        {lines.length === 0 ? (
          <p className="cl-empty">No line items yet. Click "+ Add Line Item" to add billing details.</p>
        ) : (
          lines.map((row, index) => {
            const price = computePrice(row);
            return (
              <div key={row.public_id ?? `new-${index}`} className="cl-line-item-card">
                <div className="cl-line-item-header">
                  <span className="cl-line-item-number">Line {index + 1}</span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => removeLine(index)}
                    disabled={isBilled}
                  >
                    Remove
                  </button>
                </div>
                <div className="cl-form-row">
                  <div className="cl-field cl-field-sm">
                    <label>Date</label>
                    <input type="date" value={row.line_date} onChange={(e) => updateLine(index, { line_date: e.target.value })} disabled={isBilled} />
                  </div>
                  <div className="cl-field">
                    <label>Project</label>
                    <select
                      value={row.project_id}
                      onChange={(e) => updateLine(index, { project_id: e.target.value })}
                      disabled={isBilled || row.is_overhead}
                    >
                      <option value="">— Select Project —</option>
                      {sortedProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.abbreviation ? `${p.abbreviation} - ${p.name}` : p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="cl-field">
                    <label>SubCostCode</label>
                    <select
                      value={row.sub_cost_code_id}
                      onChange={(e) => updateLine(index, { sub_cost_code_id: e.target.value })}
                      disabled={isBilled}
                    >
                      <option value="">— Select SubCostCode —</option>
                      {sortedSubCostCodes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.number} - {s.description || s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="cl-form-row">
                  <div className="cl-field cl-field-sm">
                    <label>Hours</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="24"
                      value={row.hours}
                      onChange={(e) => updateLine(index, { hours: e.target.value })}
                      placeholder="0.00"
                      disabled={isBilled}
                    />
                  </div>
                  <div className="cl-field cl-field-sm">
                    <label>Rate (per day)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.rate}
                      onChange={(e) => updateLine(index, { rate: e.target.value })}
                      placeholder="0.00"
                      disabled={isBilled}
                    />
                  </div>
                  <div className="cl-field cl-field-sm">
                    <label>Markup (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={row.markup_percent}
                      onChange={(e) => updateLine(index, { markup_percent: e.target.value })}
                      placeholder="0"
                      disabled={isBilled}
                    />
                  </div>
                  <div className="cl-field cl-field-sm">
                    <label>Price</label>
                    <input type="text" value={fmtMoney(price)} readOnly className="cl-calculated" />
                  </div>
                  <div className="cl-field cl-field-xs">
                    <label>Billable</label>
                    <input type="checkbox" checked={row.is_billable} onChange={(e) => updateLine(index, { is_billable: e.target.checked })} disabled={isBilled} />
                  </div>
                  <div className="cl-field cl-field-xs">
                    <label>Overhead</label>
                    <input type="checkbox" checked={row.is_overhead} onChange={(e) => updateLine(index, { is_overhead: e.target.checked })} disabled={isBilled} />
                  </div>
                </div>
                <div className="cl-form-row">
                  <div className="cl-field cl-field-full">
                    <label>Description</label>
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                      placeholder="e.g., We removed lights in ceiling."
                      disabled={isBilled}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div className="cl-line-items-total">
          <span><strong>Total Hours:</strong> {allocatedThisEntry.toFixed(2)} ({fmtHHMM(allocatedThisEntry)})</span>
          <span><strong>Total Price:</strong> {fmtMoney(totalPrice)}</span>
        </div>
      </section>

      <div className="cl-form-actions">
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={saving || isBilled}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save(true)} disabled={saving || isBilled}>
            Save &amp; Mark Ready
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/contract-labor/list" className="btn btn-secondary">Cancel</Link>
          {!isBilled && (
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadOnlyItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`cl-readonly-item${highlight ? " cl-readonly-highlight" : ""}`}>
      <label>{label}</label>
      <span>{value}</span>
    </div>
  );
}

function HoursStat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "over" }) {
  return (
    <div className="cl-hours-item">
      <span className="cl-hours-label">{label}</span>
      <span className={`cl-hours-value${tone ? ` cl-hours-${tone}` : ""}`}>{value}</span>
    </div>
  );
}
