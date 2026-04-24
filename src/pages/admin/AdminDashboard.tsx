import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOne, getList, ApiError } from "../../api/client";

interface Stats {
  workflows_today: number;
  completed_today: number;
  awaiting_approval: number;
  failed_24h: number;
  active_workflows: number;
  avg_completion_minutes: number;
  generated_at: string;
}

interface WorkflowSummary {
  public_id: string;
  workflow_type: string | null;
  state: string | null;
  vendor_name: string | null;
  vendor_id: number | null;
  project_id: number | null;
  bill_id: number | null;
  invoice_number: string | null;
  amount: number | null;
  created_datetime: string | null;
  modified_datetime: string | null;
  completed_datetime: string | null;
  is_active: boolean;
}

const STATES = [
  "received",
  "processing",
  "awaiting_approval",
  "completed",
  "failed",
] as const;

const stateBadgeColor = (s: string | null): string => {
  switch (s) {
    case "completed":
      return "#16a34a";
    case "failed":
      return "#dc2626";
    case "awaiting_approval":
      return "#d97706";
    case "cancelled":
    case "abandoned":
    case "rejected":
      return "#64748b";
    default:
      return "#2563eb";
  }
};

const fmtMoney = (n: number | null): string =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const fmtDate = (s: string | null): string => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fmtType = (s: string | null): string =>
  !s ? "—" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const useDebounce = <T,>(value: T, delay = 300): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [statsError, setStatsError] = useState("");
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const debouncedQ = useDebounce(q, 300);

  const loadStats = useCallback(async () => {
    try {
      setStats(await getOne<Stats>("/api/v1/admin/stats"));
      setStatsError("");
    } catch (err) {
      setStatsError(err instanceof ApiError ? err.detail : "Failed to load stats.");
    }
  }, []);

  const loadWorkflows = useCallback(async () => {
    try {
      const path =
        debouncedQ || state
          ? `/api/v1/workflows/search?${new URLSearchParams({
              ...(debouncedQ && { q: debouncedQ }),
              ...(state && { state }),
              limit: "50",
            }).toString()}`
          : "/api/v1/admin/recent-workflows?limit=50";
      const res = await getList<WorkflowSummary>(path);
      setWorkflows(res.data);
      setListError("");
    } catch (err) {
      setListError(err instanceof ApiError ? err.detail : "Failed to load workflows.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, state]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const isFiltering = debouncedQ.length > 0 || state.length > 0;

  return (
    <div className="page">
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <h1>Admin</h1>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            loadStats();
            loadWorkflows();
          }}
        >
          Refresh
        </button>
      </div>

      {statsError && (
        <div className="form-error" style={{ marginBottom: 16 }}>
          {statsError}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Stat label="Workflows Today" value={stats?.workflows_today} />
        <Stat
          label="Completed Today"
          value={stats?.completed_today}
          tone="success"
        />
        <Stat
          label="Awaiting Approval"
          value={stats?.awaiting_approval}
          tone="warning"
        />
        <Stat label="Failed (24h)" value={stats?.failed_24h} tone="error" />
        <Stat label="Active Workflows" value={stats?.active_workflows} />
        <Stat
          label="Avg Completion"
          value={
            stats
              ? `${stats.avg_completion_minutes} min`
              : undefined
          }
        />
      </div>

      <div
        className="detail-card"
        style={{ padding: 20 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0 }}>
            Recent Activity{" "}
            {isFiltering && (
              <span style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 400 }}>
                ({workflows.length} result{workflows.length === 1 ? "" : "s"})
              </span>
            )}
          </h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search vendor, invoice #, or amount..."
              className="inline-li-input"
              style={{ minWidth: 260 }}
            />
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="inline-li-input"
            >
              <option value="">All States</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {fmtType(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {listError && <div className="form-error">{listError}</div>}

        {loading ? (
          <div className="page-loading">Loading...</div>
        ) : workflows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--color-text-secondary)" }}>
            <p style={{ margin: 0 }}>No workflows match the current filter.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>State</th>
                <th>Vendor</th>
                <th>Invoice #</th>
                <th>Amount</th>
                <th>Created</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr key={wf.public_id}>
                  <td>{fmtType(wf.workflow_type)}</td>
                  <td>
                    <span
                      style={{
                        color: stateBadgeColor(wf.state),
                        fontWeight: 500,
                        textTransform: "capitalize",
                      }}
                    >
                      {(wf.state ?? "—").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>{wf.vendor_name ?? "—"}</td>
                  <td>{wf.invoice_number ?? "—"}</td>
                  <td>{fmtMoney(wf.amount)}</td>
                  <td>{fmtDate(wf.created_datetime)}</td>
                  <td>
                    <Link
                      to={`/admin/workflow/${wf.public_id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number | string;
  tone?: "success" | "warning" | "error";
}) {
  const color =
    tone === "success"
      ? "#16a34a"
      : tone === "warning"
        ? "#d97706"
        : tone === "error"
          ? "#dc2626"
          : "#334155";
  return (
    <div
      style={{
        padding: 14,
        background: "#f8fafc",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color, marginTop: 4 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}
