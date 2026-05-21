import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getOne, post } from "../../api/client";
import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import PageHeader from "../../components/PageHeader";
import type {
  Project,
  TimeEntry,
  TimeEntryStatusValue,
  User,
} from "../../types/api";

const STATUS_LABELS: Record<TimeEntryStatusValue, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  billed: "Billed",
};

const STATUS_CLASSES: Record<TimeEntryStatusValue, string> = {
  draft: "draft",
  submitted: "in-review",
  approved: "approved",
  rejected: "declined",
  billed: "finalized",
};

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return v;
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fmtDuration(decimalHours: string | null | undefined): string {
  if (decimalHours == null || decimalHours === "") return "—";
  const n = Number(decimalHours);
  if (!isFinite(n) || n < 0) return "—";
  const h = Math.trunc(n);
  const m = Math.round((n - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function gpsLink(lat: string | null, lng: string | null): string | null {
  if (!lat || !lng) return null;
  const a = Number(lat);
  const o = Number(lng);
  if (!isFinite(a) || !isFinite(o)) return null;
  return `https://www.google.com/maps?q=${a},${o}`;
}

export default function TimeEntryView() {
  const { id: publicId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();

  const canApprove = useMemo(() => {
    const mod = me?.modules?.find((m) => m.name === "Time Tracking");
    return Boolean(mod?.can_update);
  }, [me]);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  const { data: entry, isLoading, error } = useQuery<TimeEntry>({
    queryKey: ["time-entry", publicId],
    queryFn: () => getOne<TimeEntry>(`/api/v1/time-entries/${publicId}`),
    enabled: !!publicId,
  });

  const users = useEntityList<User>("/api/v1/get/users").items;
  const userMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of users) {
      const name = [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || "Unknown";
      m.set(u.id, name);
    }
    return m;
  }, [users]);

  const projects = useEntityList<Project>("/api/v1/get/projects").items;
  const projectMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  if (!publicId) return <div className="page-error">Missing time entry id.</div>;
  if (isLoading) return <div className="page-loading">Loading...</div>;
  if (error) {
    const msg =
      error instanceof ApiError && error.status === 404
        ? "Time entry not found."
        : (error as Error).message;
    return <div className="page-error">{msg}</div>;
  }
  if (!entry) return <div className="page-error">Time entry not found.</div>;

  const current = (entry.current_status ?? "draft") as TimeEntryStatusValue;
  const workerName = entry.user_id != null ? userMap.get(entry.user_id) ?? "—" : "—";
  const logs = entry.time_logs ?? [];
  const history = entry.status_history ?? [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["time-entry", publicId] });
    await queryClient.invalidateQueries({ queryKey: ["time-entry-list"] });
    await queryClient.invalidateQueries({ queryKey: ["time-entry-count"] });
  }

  async function doApprove() {
    setBusy("approve");
    try {
      await post(`/api/v1/time-entries/${publicId}/approve`, {
        note: approvalNote.trim() || null,
      });
      setApprovalNote("");
      toast("Time entry approved.", "success");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to approve", "error");
    } finally {
      setBusy(null);
    }
  }

  async function doReject() {
    if (!rejectNote.trim()) {
      toast("Please add a reason for rejection.", "error");
      return;
    }
    setBusy("reject");
    try {
      await post(`/api/v1/time-entries/${publicId}/reject`, {
        note: rejectNote.trim(),
      });
      setRejectNote("");
      setRejectOpen(false);
      toast("Time entry rejected and returned to the worker.", "success");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to reject", "error");
    } finally {
      setBusy(null);
    }
  }

  const isSubmitted = current === "submitted";
  const isDraft = current === "draft";

  return (
    <div className="page">
      <PageHeader title={`Time Entry — ${fmtDate(entry.work_date)}`}>
        <Link to="/time-entry/list" className="btn btn-secondary">
          Back to List
        </Link>
        {isDraft && (
          <Link to={`/time-entry/${publicId}/edit`} className="btn btn-primary">
            Edit
          </Link>
        )}
      </PageHeader>

      <div className="detail-section">
        <div className="detail-grid">
          <div>
            <div className="detail-label">Worker</div>
            <div className="detail-value">{workerName}</div>
          </div>
          <div>
            <div className="detail-label">Work Date</div>
            <div className="detail-value">{fmtDate(entry.work_date)}</div>
          </div>
          <div>
            <div className="detail-label">Status</div>
            <div className="detail-value">
              <span className={`status-badge ${STATUS_CLASSES[current] ?? ""}`}>
                {STATUS_LABELS[current] ?? current}
              </span>
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div className="detail-label">Worker Note</div>
            <div className="detail-value">{entry.note || <span className="text-muted">—</span>}</div>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <h2>Time Logs ({logs.length})</h2>
        {logs.length === 0 ? (
          <p className="text-muted">No time logs recorded.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th>Duration</th>
                <th>Project</th>
                <th>Note</th>
                <th>GPS</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const link = gpsLink(log.latitude, log.longitude);
                const projectName =
                  log.project_id != null ? projectMap.get(log.project_id) ?? "—" : "—";
                return (
                  <tr key={log.public_id}>
                    <td style={{ textTransform: "capitalize" }}>{log.log_type ?? "—"}</td>
                    <td>{fmtTime(log.clock_in)}</td>
                    <td>{log.clock_out ? fmtTime(log.clock_out) : <em className="text-muted">still clocked in</em>}</td>
                    <td>{fmtDuration(log.duration)}</td>
                    <td>{projectName}</td>
                    <td>{log.note || <span className="text-muted">—</span>}</td>
                    <td>
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer">
                          Map
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="detail-section">
        <h2>Status History</h2>
        {history.length === 0 ? (
          <p className="text-muted">No transitions recorded.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>Actor</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => {
                const status = s.status as TimeEntryStatusValue;
                const actorName =
                  s.user_id != null ? userMap.get(s.user_id) ?? "—" : "—";
                return (
                  <tr key={s.public_id}>
                    <td>{fmtDateTime(s.created_datetime)}</td>
                    <td>
                      <span className={`status-badge ${STATUS_CLASSES[status] ?? ""}`}>
                        {STATUS_LABELS[status] ?? status}
                      </span>
                    </td>
                    <td>{actorName}</td>
                    <td>{s.note || <span className="text-muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {isSubmitted && canApprove && (
        <div className="detail-section">
          <h2>Review</h2>
          {!rejectOpen ? (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexDirection: "column", maxWidth: 640 }}>
              <label htmlFor="te-approval-note" className="detail-label">
                Approval note (optional)
              </label>
              <textarea
                id="te-approval-note"
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                rows={2}
                style={{ width: "100%" }}
                placeholder="Optional comment for the approval record…"
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={doApprove}
                  disabled={busy !== null}
                >
                  {busy === "approve" ? "Approving…" : "Approve"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setRejectOpen(true)}
                  disabled={busy !== null}
                >
                  Reject
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexDirection: "column", maxWidth: 640 }}>
              <label htmlFor="te-reject-note" className="detail-label">
                Rejection reason (required)
              </label>
              <textarea
                id="te-reject-note"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={3}
                style={{ width: "100%" }}
                placeholder="Tell the worker what to fix before resubmitting…"
                autoFocus
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={doReject}
                  disabled={busy !== null || !rejectNote.trim()}
                >
                  {busy === "reject" ? "Rejecting…" : "Confirm Reject"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setRejectOpen(false);
                    setRejectNote("");
                  }}
                  disabled={busy !== null}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
