import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { rawRequest } from "../../api/client";
import { STATUS_LABELS } from "./employeeLaborStatus";

interface EmployeeLaborRow {
  id: number;
  public_id: string;
  employee_id: number;
  project_id: number | null;
  work_date: string;
  billing_period_start: string;
  billing_period_end: string;
  total_hours: string | null;
  hourly_rate: string | null;
  markup: string | null;
  total_amount: string | null;
  description: string | null;
  status: string;
  source_time_entry_id: number | null;
  invoice_line_item_id: number | null;
  employee_name?: string | null;
  project_name?: string | null;
}

function currentPeriodStart(): string {
  const now = new Date();
  const day = now.getDate();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return day <= 15 ? `${y}-${m}-01` : `${y}-${m}-16`;
}

export default function EmployeeLaborList() {
  const [period, setPeriod] = useState(currentPeriodStart());
  const [items, setItems] = useState<EmployeeLaborRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    rawRequest<{ data: EmployeeLaborRow[] }>(
      `/api/v1/get/employee-labors?billing_period_start=${encodeURIComponent(period)}`,
    )
      .then((res) => {
        if (!cancelled) setItems(res.data ?? []);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const totalAmount = items.reduce((acc, r) => acc + Number(r.total_amount ?? 0), 0);
  const totalHours = items.reduce((acc, r) => acc + Number(r.total_hours ?? 0), 0);

  return (
    <div className="page">
      <PageHeader title="Employee Labor" count={items.length} />

      <div style={{ marginBottom: 16 }}>
        <label style={{ marginRight: 8 }}>Billing Period Start:</label>
        <input
          type="date"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
        <span style={{ marginLeft: 16, color: "var(--muted)" }}>
          Total: {totalHours.toFixed(2)} hrs / ${totalAmount.toFixed(2)}
        </span>
      </div>

      {loading && <div className="page-loading">Loading...</div>}
      {error && <div className="page-error">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="text-muted">No employee labor for this period.</div>
      )}

      {!loading && !error && items.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Project</th>
              <th>Work Date</th>
              <th style={{ textAlign: "right" }}>Hours</th>
              <th style={{ textAlign: "right" }}>Rate</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.public_id}>
                <td>
                  <Link to={`/employee-labor/${r.public_id}`}>
                    {r.employee_name ?? `Employee #${r.employee_id}`}
                  </Link>
                </td>
                <td>{r.project_name ?? (r.project_id ? `#${r.project_id}` : "—")}</td>
                <td>{r.work_date}</td>
                <td style={{ textAlign: "right" }}>{r.total_hours ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  {r.hourly_rate ? `$${r.hourly_rate}` : <span className="text-muted">no rate</span>}
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.total_amount ? `$${Number(r.total_amount).toFixed(2)}` : "—"}
                </td>
                <td>{STATUS_LABELS[r.status] ?? r.status}</td>
                <td className="text-muted" style={{ fontSize: "0.85em" }}>
                  {r.description ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
