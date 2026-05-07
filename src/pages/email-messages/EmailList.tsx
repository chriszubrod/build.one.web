import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import Pagination from "../../components/Pagination";
import PageHeader from "../../components/PageHeader";
import type { EmailMessage } from "../../types/api";

const STATUS_OPTIONS = [
  { value: "awaiting_review", label: "Awaiting review" },
  { value: "agent_complete", label: "Agent complete" },
  { value: "irrelevant", label: "Irrelevant" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "extracted", label: "Extracted" },
  { value: "failed", label: "Failed" },
  { value: "", label: "All statuses" },
];

function fmtDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtConfidence(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  if (isNaN(n)) return "";
  return `${(n * 100).toFixed(0)}%`;
}

function statusBadgeClass(status: string): string {
  if (status === "awaiting_review") return "badge badge-warning";
  if (status === "agent_complete") return "badge badge-success";
  if (status === "irrelevant") return "badge badge-muted";
  if (status === "failed") return "badge badge-danger";
  return "badge";
}

export default function EmailList() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    try {
      return sessionStorage.getItem("buildOne.emailList.status") ?? "awaiting_review";
    } catch {
      return "awaiting_review";
    }
  });

  const basePath = `/api/v1/get/email-messages${statusFilter ? `?processing_status=${encodeURIComponent(statusFilter)}` : ""}`;
  const { items, total, page, pageSize, loading, error, setPage, setSearch, search, totalPages } =
    usePaginatedList<EmailMessage>(basePath, 50, {
      staleWhileRevalidate: true,
      sessionPersistenceKey: `buildOne.emailList.${statusFilter}`,
    });

  const handleStatusChange = (next: string) => {
    setStatusFilter(next);
    try {
      sessionStorage.setItem("buildOne.emailList.status", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="page">
      <PageHeader title="Email Inbox" />

      <div className="filter-row" style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <label htmlFor="status-filter" style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Status:
        </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          style={{ minWidth: 180 }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          type="search"
          placeholder="Search subject / from..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, maxWidth: 360 }}
        />

        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-muted)" }}>
          {total} {total === 1 ? "email" : "emails"}
        </span>
      </div>

      {error && <div className="page-error">{error}</div>}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Received</th>
              <th>From</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Classification</th>
              <th>Action</th>
              <th>Conf.</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted">Loading...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted">No emails match this filter.</td>
              </tr>
            ) : (
              items.map((em) => (
                <tr
                  key={em.public_id}
                  onClick={() => navigate(`/email-message/${em.public_id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td>{fmtDate(em.received_datetime)}</td>
                  <td>{em.from_name || em.from_address}</td>
                  <td>{em.subject || <span className="text-muted">(no subject)</span>}</td>
                  <td><span className={statusBadgeClass(em.processing_status)}>{em.processing_status}</span></td>
                  <td>{em.agent_classification || <span className="text-muted">—</span>}</td>
                  <td>{em.agent_decided_action || <span className="text-muted">—</span>}</td>
                  <td>{fmtConfidence(em.agent_classification_confidence)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}
