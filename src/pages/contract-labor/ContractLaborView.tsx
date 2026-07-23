import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError, getList, getOne } from "../../api/client";
import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { hasContractLaborPermission } from "./contractLaborPermissions";
import { STATUS_CLASSES, STATUS_LABELS } from "./contractLaborStatus";
import type {
  ContractLabor,
  ContractLaborDailySummary,
  ContractLaborLineItem,
  Project,
  SubCostCode,
  Vendor,
} from "../../types/api";

const MAX_DAILY_HOURS = 8;

function fmtNum(v: string | null | number | undefined, digits = 2): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return isFinite(n) ? n.toFixed(digits) : String(v);
}

function fmtMoney(v: string | null | number | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : String(v);
}

function fmtPercent(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return isFinite(n) ? `${(n * 100).toFixed(2)}%` : String(v);
}

function fmtHHMM(decHours: string | null | number | undefined): string {
  const n = Number(decHours ?? 0);
  if (!isFinite(n) || n === 0) return "00:00";
  const h = Math.trunc(n);
  const m = Math.round((n - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtBool(v: boolean | null | undefined): string {
  if (v == null) return "—";
  return v ? "Yes" : "No";
}

export default function ContractLaborView() {
  const { publicId } = useParams<{ publicId: string }>();
  const { data: me } = useCurrentUser();
  // PUT /api/v1/contract-labor/{id}/bill — can_update
  const canEdit = hasContractLaborPermission(me, "can_update");

  const entryQuery = useQuery<ContractLabor>({
    queryKey: ["cl-entry", publicId],
    queryFn: () => getOne<ContractLabor>(`/api/v1/contract-labor/${publicId}`),
    enabled: Boolean(publicId),
  });

  const lineItemsQuery = useQuery<ContractLaborLineItem[]>({
    queryKey: ["cl-line-items", publicId],
    queryFn: async () => {
      try {
        const res = await getList<ContractLaborLineItem>(`/api/v1/contract-labor/${publicId}/line-items`);
        return res.data;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return [];
        throw err;
      }
    },
    enabled: Boolean(publicId),
  });

  const dailySummaryQuery = useQuery<ContractLaborDailySummary>({
    queryKey: ["cl-daily-summary", publicId],
    queryFn: () => getOne<ContractLaborDailySummary>(`/api/v1/contract-labor/${publicId}/daily-summary`),
    enabled: Boolean(publicId),
  });

  const entry = entryQuery.data;
  const sourceTimeEntryPublicId = entry?.source_time_entry_public_id ?? null;

  // Lookups for ID → name resolution (vendors → bill vendor name;
  // projects + sub_cost_codes → line-item labels)
  const { items: vendors } = useEntityList<Vendor>("/api/v1/get/vendors");
  const { items: projects } = useEntityList<Project>("/api/v1/get/projects");
  const { items: subCostCodes } = useEntityList<SubCostCode>("/api/v1/get/sub-cost-codes");

  const vendorById = useMemo(() => {
    const m = new Map<number, Vendor>();
    for (const v of vendors) m.set(v.id, v);
    return m;
  }, [vendors]);
  const projectById = useMemo(() => {
    const m = new Map<number, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);
  const subCostCodeById = useMemo(() => {
    const m = new Map<number, SubCostCode>();
    for (const s of subCostCodes) m.set(s.id, s);
    return m;
  }, [subCostCodes]);

  const lines = lineItemsQuery.data ?? [];
  const allocatedThisEntry = useMemo(
    () => lines.reduce((sum, r) => sum + Number(r.hours ?? 0), 0),
    [lines],
  );
  const totalAmount = useMemo(
    () => lines.reduce((sum, r) => sum + Number(r.hours ?? 0) * Number(r.rate ?? 0), 0),
    [lines],
  );
  const totalPrice = useMemo(
    () =>
      lines.reduce(
        (sum, r) =>
          sum +
          Number(r.hours ?? 0) *
            Number(r.rate ?? 0) *
            (1 + Number(r.markup ?? 0)),
        0,
      ),
    [lines],
  );

  if (entryQuery.isLoading) return <div className="page-loading">Loading...</div>;
  if (entryQuery.error) {
    return <div className="page-error">{(entryQuery.error as Error).message}</div>;
  }
  if (!entry) return <div className="page-error">Not found.</div>;

  const allocatedOther = dailySummaryQuery.data?.allocated_other_entries ?? 0;
  const remaining8h = MAX_DAILY_HOURS - allocatedOther - allocatedThisEntry;
  const billVendor = entry.bill_vendor_id ? vendorById.get(entry.bill_vendor_id) : undefined;
  const hasBillInfo = Boolean(
    entry.bill_vendor_id || entry.bill_date || entry.due_date || entry.bill_number || entry.bill_line_item_id,
  );
  const statusBadge = (
    <span className={`status-badge ${STATUS_CLASSES[entry.status] ?? ""}`}>
      {STATUS_LABELS[entry.status] ?? entry.status}
    </span>
  );

  return (
    <div className="page form-page-wide">
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <h1 style={{ margin: 0 }}>Contract Labor — {entry.employee_name}</h1>
          {statusBadge}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/contract-labor/list" className="btn btn-secondary">
            Back to List
          </Link>
          {canEdit && (
            <Link to={`/contract-labor/${publicId}/edit`} className="btn btn-primary">
              Edit
            </Link>
          )}
        </div>
      </div>

      {/* Source info strip */}
      <div className="cl-edit-source">
        <span>
          <strong>Source:</strong>{" "}
          {sourceTimeEntryPublicId
            ? "TimeTracking"
            : entry.source_file || "Manual"}
        </span>
        {entry.source_row && (
          <span>
            <strong>Row:</strong> {entry.source_row}
          </span>
        )}
        {entry.import_batch_id && (
          <span>
            <strong>Batch:</strong> <code>{entry.import_batch_id}</code>
          </span>
        )}
        <span>
          <strong>Public ID:</strong> <code>{entry.public_id}</code>
        </span>
      </div>

      {/* Time Entry Details */}
      <section className="cl-edit-section">
        <h3>Time Entry Details</h3>
        <div className="cl-readonly-grid">
          <ReadOnlyItem label="Work Date" value={entry.work_date || "—"} />
          <ReadOnlyItem label="Worker Name" value={entry.employee_name || "—"} />
          <ReadOnlyItem
            label="Total Hours"
            value={`${fmtNum(entry.total_hours)} (${fmtHHMM(entry.total_hours)})`}
            highlight
          />
        </div>
        {entry.description && (
          <div className="cl-readonly-notes">
            <label>Notes</label>
            <p>{entry.description}</p>
          </div>
        )}
      </section>

      {/* Daily Hours Summary */}
      <section className="cl-edit-section cl-hours-summary">
        <h3>Daily Hours Summary for {entry.employee_name || "Worker"}</h3>
        <div className="cl-hours-grid">
          <HoursStat label="Work Date" value={entry.work_date || "—"} />
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
      </section>

      {/* Line items */}
      <section className="cl-edit-section">
        <div className="cl-section-header">
          <h3>Line Items ({lines.length})</h3>
        </div>
        {lineItemsQuery.isLoading && <p className="cl-empty">Loading line items...</p>}
        {!lineItemsQuery.isLoading && lines.length === 0 && (
          <p className="cl-empty">No line items on this entry.</p>
        )}
        {lines.length > 0 && (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Project</th>
                  <th>SubCostCode</th>
                  <th style={{ textAlign: "right" }}>Hours</th>
                  <th style={{ textAlign: "right" }}>Rate</th>
                  <th style={{ textAlign: "right" }}>Markup</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th>Billable</th>
                  <th>Overhead</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((row, i) => {
                  const proj = row.project_id ? projectById.get(row.project_id) : undefined;
                  const scc = row.sub_cost_code_id ? subCostCodeById.get(row.sub_cost_code_id) : undefined;
                  const hours = Number(row.hours ?? 0);
                  const rate = Number(row.rate ?? 0);
                  const markup = Number(row.markup ?? 0);
                  const amount = hours * rate;
                  const price = amount * (1 + markup);
                  return (
                    <tr key={row.public_id ?? i}>
                      <td>{i + 1}</td>
                      <td>{row.line_date || "—"}</td>
                      <td>
                        {row.is_overhead
                          ? <em>(Overhead)</em>
                          : proj
                            ? proj.abbreviation && !proj.name.startsWith(proj.abbreviation)
                              ? `${proj.abbreviation} - ${proj.name}`
                              : proj.name
                            : row.project_id
                              ? `#${row.project_id}`
                              : "—"}
                      </td>
                      <td>
                        {scc
                          ? `${scc.number} — ${scc.description || scc.name}`
                          : row.sub_cost_code_id
                            ? `#${row.sub_cost_code_id}`
                            : "—"}
                      </td>
                      <td style={{ textAlign: "right" }}>{fmtNum(row.hours)}</td>
                      <td style={{ textAlign: "right" }}>{fmtMoney(row.rate)}</td>
                      <td style={{ textAlign: "right" }}>{fmtPercent(row.markup)}</td>
                      <td style={{ textAlign: "right" }}>{fmtMoney(amount)}</td>
                      <td style={{ textAlign: "right" }}>{fmtMoney(price)}</td>
                      <td>{fmtBool(row.is_billable)}</td>
                      <td>{fmtBool(row.is_overhead)}</td>
                      <td>{row.description || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="cl-line-items-total">
              <span>
                <strong>Total Hours:</strong> {allocatedThisEntry.toFixed(2)} ({fmtHHMM(allocatedThisEntry)})
              </span>
              <span>
                <strong>Total Amount:</strong> {fmtMoney(totalAmount)}
              </span>
              <span>
                <strong>Total Price:</strong> {fmtMoney(totalPrice)}
              </span>
            </div>
          </>
        )}
      </section>

      {/* Bill Information (only if any bill field is set) */}
      {hasBillInfo && (
        <section className="cl-edit-section">
          <h3>Bill Information</h3>
          <div className="cl-readonly-grid">
            <ReadOnlyItem
              label="Bill Vendor"
              value={billVendor ? billVendor.name : entry.bill_vendor_id ? `#${entry.bill_vendor_id}` : "—"}
            />
            <ReadOnlyItem label="Bill Number" value={entry.bill_number || "—"} />
            <ReadOnlyItem label="Bill Date" value={entry.bill_date || "—"} />
            <ReadOnlyItem label="Due Date" value={entry.due_date || "—"} />
            <ReadOnlyItem
              label="BillLineItem Id"
              value={entry.bill_line_item_id != null ? String(entry.bill_line_item_id) : "—"}
            />
          </div>
        </section>
      )}

    </div>
  );
}

function ReadOnlyItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`cl-readonly-item${highlight ? " cl-readonly-highlight" : ""}`}>
      <label>{label}</label>
      <span>{value}</span>
    </div>
  );
}

function HoursStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "over";
}) {
  return (
    <div className="cl-hours-item">
      <span className="cl-hours-label">{label}</span>
      <span className={`cl-hours-value${tone ? ` cl-hours-${tone}` : ""}`}>{value}</span>
    </div>
  );
}
