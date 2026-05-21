import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, del, getOne, post, put } from "../../api/client";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import PageHeader from "../../components/PageHeader";
import type {
  Project,
  TimeEntry,
  TimeLog,
  TimeEntryStatusValue,
  User,
} from "../../types/api";

interface HeaderForm {
  row_version: string;
  user_public_id: string;
  work_date: string;
  note: string;
}

interface LogRow {
  // Server identity (null = unsaved new row)
  id: number | null;
  public_id: string | null;
  row_version: string | null;
  // Editable fields kept as strings to avoid coercion issues
  clock_in: string; // datetime-local "YYYY-MM-DDTHH:MM"
  clock_out: string;
  log_type: "work" | "break";
  project_id: string; // BIGINT as string, "" = none
  note: string;
  // Server-computed (display only)
  duration: string | null;
  latitude: string | null;
  longitude: string | null;
  // Per-row UX state
  dirty: boolean;
  saving: boolean;
  error: string;
}

// Convert API "YYYY-MM-DD HH:MM:SS" → HTML "YYYY-MM-DDTHH:MM"
function apiToLocal(v: string | null): string {
  if (!v) return "";
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(v);
  return m ? `${m[1]}T${m[2]}` : "";
}

// Convert HTML "YYYY-MM-DDTHH:MM" → API "YYYY-MM-DD HH:MM:SS"
function localToApi(v: string): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:(\d{2}))?$/.exec(v);
  if (!m) return null;
  return `${m[1]} ${m[2]}:${m[4] ?? "00"}`;
}

function fmtDuration(decimalHours: string | null): string {
  if (decimalHours == null || decimalHours === "") return "—";
  const n = Number(decimalHours);
  if (!isFinite(n) || n < 0) return "—";
  const h = Math.trunc(n);
  const m = Math.round((n - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function logFromServer(log: TimeLog): LogRow {
  return {
    id: log.id,
    public_id: log.public_id,
    row_version: log.row_version,
    clock_in: apiToLocal(log.clock_in),
    clock_out: apiToLocal(log.clock_out),
    log_type: (log.log_type as "work" | "break") || "work",
    project_id: log.project_id != null ? String(log.project_id) : "",
    note: log.note ?? "",
    duration: log.duration,
    latitude: log.latitude,
    longitude: log.longitude,
    dirty: false,
    saving: false,
    error: "",
  };
}

function emptyLog(workDate: string): LogRow {
  return {
    id: null,
    public_id: null,
    row_version: null,
    clock_in: workDate ? `${workDate}T08:00` : "",
    clock_out: workDate ? `${workDate}T17:00` : "",
    log_type: "work",
    project_id: "",
    note: "",
    duration: null,
    latitude: null,
    longitude: null,
    dirty: true,
    saving: false,
    error: "",
  };
}

export default function TimeEntryEdit() {
  const { id: publicId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.is_admin ?? false;

  const [form, setForm] = useState<HeaderForm | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [pageBusy, setPageBusy] = useState<"submit" | "delete" | null>(null);
  const [headerError, setHeaderError] = useState("");

  const isSavingRef = useRef(false);

  const { data: entry, isLoading, error } = useQuery<TimeEntry>({
    queryKey: ["time-entry", publicId],
    queryFn: () => getOne<TimeEntry>(`/api/v1/time-entries/${publicId}`),
    enabled: !!publicId,
  });

  const users = useEntityList<User>("/api/v1/get/users").items;
  const projects = useEntityList<Project>("/api/v1/get/projects").items;
  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        const an = [a.firstname, a.lastname].filter(Boolean).join(" ").toLowerCase();
        const bn = [b.firstname, b.lastname].filter(Boolean).join(" ").toLowerCase();
        return an.localeCompare(bn);
      }),
    [users],
  );
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects],
  );

  // Hydrate form state from server fetch (once per entry load)
  useEffect(() => {
    if (!entry) return;
    const worker = users.find((u) => u.id === entry.user_id);
    setForm({
      row_version: entry.row_version,
      user_public_id: worker?.public_id ?? "",
      work_date: entry.work_date ?? "",
      note: entry.note ?? "",
    });
    setLogs((entry.time_logs ?? []).map(logFromServer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.public_id, users.length]);

  const currentStatus = (entry?.current_status ?? "draft") as TimeEntryStatusValue;
  const isDraft = currentStatus === "draft";

  const autoSaveHeader = useCallback(async () => {
    if (!form || !publicId || isSavingRef.current) return;
    isSavingRef.current = true;
    setHeaderError("");
    try {
      const updated = await put<TimeEntry>(`/api/v1/time-entries/${publicId}`, {
        row_version: form.row_version,
        user_public_id: form.user_public_id || undefined,
        work_date: form.work_date,
        note: form.note || null,
      });
      setForm((prev) => (prev ? { ...prev, row_version: updated.row_version } : prev));
    } catch (err) {
      // Surface but don't block — the user can retry by editing again
      setHeaderError(err instanceof Error ? err.message : "Auto-save failed");
    } finally {
      isSavingRef.current = false;
    }
  }, [form, publicId]);

  const { flush: flushAutoSave, cancel: cancelAutoSave } = useAutoSave(
    autoSaveHeader,
    [form?.user_public_id, form?.work_date, form?.note],
    300,
    !!form && !!entry && isDraft,
  );

  if (!publicId) return <div className="page-error">Missing time entry id.</div>;
  if (isLoading) return <div className="page-loading">Loading...</div>;
  if (error) {
    const msg =
      error instanceof ApiError && error.status === 404
        ? "Time entry not found."
        : (error as Error).message;
    return <div className="page-error">{msg}</div>;
  }
  if (!entry || !form) return null;

  if (!isDraft) {
    return (
      <div className="page">
        <PageHeader title="Edit Time Entry">
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/time-entry/${publicId}`)}>
            Back to View
          </button>
        </PageHeader>
        <div className="form-error">
          This time entry is <strong>{currentStatus}</strong> and cannot be edited. Reject it first to
          return it to draft.
        </div>
      </div>
    );
  }

  function onHeaderChange(name: string, value: string) {
    setForm((prev) => (prev ? { ...prev, [name]: value } : prev));
  }

  function setLog(index: number, patch: Partial<LogRow>) {
    setLogs((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch, dirty: true, error: "" } : row)),
    );
  }

  function addLog() {
    setLogs((prev) => [...prev, emptyLog(form?.work_date ?? "")]);
  }

  async function saveLog(index: number) {
    const row = logs[index];
    if (!row) return;
    const clockInApi = localToApi(row.clock_in);
    if (!clockInApi) {
      setLogs((prev) =>
        prev.map((r, i) => (i === index ? { ...r, error: "Clock in is required." } : r)),
      );
      return;
    }
    const clockOutApi = row.clock_out ? localToApi(row.clock_out) : null;
    if (row.clock_out && !clockOutApi) {
      setLogs((prev) =>
        prev.map((r, i) => (i === index ? { ...r, error: "Clock out time is invalid." } : r)),
      );
      return;
    }
    const payload = {
      clock_in: clockInApi,
      clock_out: clockOutApi,
      log_type: row.log_type,
      project_id: row.project_id ? Number(row.project_id) : null,
      note: row.note || null,
    };
    setLogs((prev) =>
      prev.map((r, i) => (i === index ? { ...r, saving: true, error: "" } : r)),
    );
    try {
      if (row.public_id) {
        const updated = await put<TimeLog>(`/api/v1/time-logs/${row.public_id}`, {
          ...payload,
          row_version: row.row_version!,
        });
        setLogs((prev) =>
          prev.map((r, i) =>
            i === index
              ? {
                  ...r,
                  saving: false,
                  dirty: false,
                  row_version: updated.row_version,
                  duration: updated.duration,
                  latitude: updated.latitude,
                  longitude: updated.longitude,
                }
              : r,
          ),
        );
      } else {
        const created = await post<TimeLog>(`/api/v1/time-entries/${publicId}/logs`, payload);
        setLogs((prev) =>
          prev.map((r, i) =>
            i === index
              ? {
                  ...r,
                  saving: false,
                  dirty: false,
                  id: created.id,
                  public_id: created.public_id,
                  row_version: created.row_version,
                  duration: created.duration,
                  latitude: created.latitude,
                  longitude: created.longitude,
                }
              : r,
          ),
        );
      }
      toast("Time log saved.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setLogs((prev) =>
        prev.map((r, i) => (i === index ? { ...r, saving: false, error: msg } : r)),
      );
    }
  }

  async function deleteLog(index: number) {
    const row = logs[index];
    if (!row) return;
    if (!row.public_id) {
      // Unsaved row — just drop it
      setLogs((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    if (!window.confirm("Delete this time log? This cannot be undone.")) return;
    setLogs((prev) =>
      prev.map((r, i) => (i === index ? { ...r, saving: true, error: "" } : r)),
    );
    try {
      await del(`/api/v1/time-logs/${row.public_id}`);
      setLogs((prev) => prev.filter((_, i) => i !== index));
      toast("Time log deleted.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      setLogs((prev) =>
        prev.map((r, i) => (i === index ? { ...r, saving: false, error: msg } : r)),
      );
    }
  }

  async function handleSubmit() {
    const unsavedRows = logs.filter((r) => r.dirty || r.public_id == null);
    if (unsavedRows.length > 0) {
      toast("Save or remove all log rows before submitting.", "error");
      return;
    }
    if (logs.length === 0) {
      toast("Add at least one time log before submitting.", "error");
      return;
    }
    setPageBusy("submit");
    try {
      await flushAutoSave();
      await post(`/api/v1/time-entries/${publicId}/submit`, {});
      toast("Time entry submitted for review.", "success");
      await queryClient.invalidateQueries({ queryKey: ["time-entry", publicId] });
      await queryClient.invalidateQueries({ queryKey: ["time-entry-list"] });
      await queryClient.invalidateQueries({ queryKey: ["time-entry-count"] });
      navigate(`/time-entry/${publicId}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to submit", "error");
      setPageBusy(null);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this time entry and all its logs? This cannot be undone.")) return;
    // Guard against pending auto-save firing after the row is gone
    isSavingRef.current = true;
    cancelAutoSave();
    setPageBusy("delete");
    try {
      await del(`/api/v1/time-entries/${publicId}`);
      toast("Time entry deleted.", "success");
      await queryClient.invalidateQueries({ queryKey: ["time-entry-list"] });
      await queryClient.invalidateQueries({ queryKey: ["time-entry-count"] });
      navigate("/time-entry/list");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete", "error");
      isSavingRef.current = false;
      setPageBusy(null);
    }
  }

  return (
    <div className="page form-page-wide">
      <PageHeader title={`Edit Time Entry — ${form.work_date || "draft"}`}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate(`/time-entry/${publicId}`)}
          disabled={pageBusy !== null}
        >
          View
        </button>
      </PageHeader>

      <form className="form-card" onSubmit={(e) => e.preventDefault()}>
        {headerError && <div className="form-error">{headerError}</div>}

        <div className="form-header-grid">
          {isAdmin ? (
            <div className="form-group">
              <label htmlFor="user_public_id">Worker</label>
              <select
                id="user_public_id"
                name="user_public_id"
                value={form.user_public_id}
                onChange={(e) => onHeaderChange("user_public_id", e.target.value)}
              >
                <option value="">Select…</option>
                {sortedUsers.map((u) => {
                  const name =
                    [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || "Unknown";
                  return (
                    <option key={u.public_id} value={u.public_id}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label>Worker</label>
              <div className="detail-value">
                {(() => {
                  const u = users.find((x) => x.public_id === form.user_public_id);
                  return u ? [u.firstname, u.lastname].filter(Boolean).join(" ") : "—";
                })()}
              </div>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="work_date">
              Work Date<span className="required">*</span>
            </label>
            <input
              id="work_date"
              name="work_date"
              type="date"
              value={form.work_date}
              onChange={(e) => onHeaderChange("work_date", e.target.value)}
              required
            />
          </div>
          <div className="full-width">
            <label htmlFor="note">Worker Note</label>
            <textarea
              id="note"
              name="note"
              value={form.note}
              onChange={(e) => onHeaderChange("note", e.target.value)}
              rows={2}
              placeholder="Optional note about the day…"
            />
          </div>
        </div>
      </form>

      <div className="form-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Time Logs ({logs.length})</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLog} disabled={pageBusy !== null}>
            + Add Log
          </button>
        </div>

        {logs.length === 0 ? (
          <p className="text-muted">No logs yet. Add at least one before submitting.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Type</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th style={{ width: 80 }}>Duration</th>
                <th>Project</th>
                <th>Note</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row, index) => (
                <tr key={row.public_id ?? `new-${index}`}>
                  <td>
                    <select
                      value={row.log_type}
                      onChange={(e) =>
                        setLog(index, { log_type: e.target.value as "work" | "break" })
                      }
                      disabled={row.saving}
                    >
                      <option value="work">Work</option>
                      <option value="break">Break</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="datetime-local"
                      value={row.clock_in}
                      onChange={(e) => setLog(index, { clock_in: e.target.value })}
                      disabled={row.saving}
                    />
                  </td>
                  <td>
                    <input
                      type="datetime-local"
                      value={row.clock_out}
                      onChange={(e) => setLog(index, { clock_out: e.target.value })}
                      disabled={row.saving}
                      placeholder="(still clocked in)"
                    />
                  </td>
                  <td>{fmtDuration(row.duration)}</td>
                  <td>
                    <select
                      value={row.project_id}
                      onChange={(e) => setLog(index, { project_id: e.target.value })}
                      disabled={row.saving}
                    >
                      <option value="">(none)</option>
                      {sortedProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={row.note}
                      onChange={(e) => setLog(index, { note: e.target.value })}
                      disabled={row.saving}
                      placeholder="Optional"
                    />
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => saveLog(index)}
                        disabled={row.saving || (!row.dirty && row.public_id != null)}
                      >
                        {row.saving ? "Saving…" : row.public_id ? "Save" : "Add"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteLog(index)}
                        disabled={row.saving}
                      >
                        Delete
                      </button>
                    </div>
                    {row.error && (
                      <div style={{ color: "var(--color-error)", fontSize: 12, marginTop: 4 }}>
                        {row.error}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="form-actions" style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={pageBusy !== null}
        >
          {pageBusy === "submit" ? "Submitting…" : "Submit for Review"}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={handleDelete}
          disabled={pageBusy !== null}
        >
          {pageBusy === "delete" ? "Deleting…" : "Delete Entry"}
        </button>
      </div>
    </div>
  );
}
