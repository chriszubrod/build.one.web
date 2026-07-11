import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  TimeEntryBilledLineageRow,
  TimeLog,
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

interface HeaderForm {
  row_version: string;
  user_public_id: string;
  work_date: string;
  note: string;
}

interface LogRow {
  // Stable client-side id — used to address a row across async saves/deletes
  // so a concurrent mutation that reorders the array can't corrupt the wrong
  // row (index-addressing is unsafe once an await is involved).
  uid: string;
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

// API "YYYY-MM-DD HH:MM:SS" → HTML "YYYY-MM-DDTHH:MM"
function apiToLocal(v: string | null): string {
  if (!v) return "";
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(v);
  return m ? `${m[1]}T${m[2]}` : "";
}

// HTML "YYYY-MM-DDTHH:MM" → API "YYYY-MM-DD HH:MM:SS"
function localToApi(v: string): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:(\d{2}))?$/.exec(v);
  if (!m) return null;
  return `${m[1]} ${m[2]}:${m[4] ?? "00"}`;
}

// Monotonic client-side id source for LogRow.uid. Module-scoped so ids stay
// unique across re-renders; deterministic (no crypto dependency) for tests.
let logUidSeq = 0;
const nextLogUid = () => `log-${(logUidSeq += 1)}`;

function logFromServer(log: TimeLog): LogRow {
  return {
    uid: nextLogUid(),
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
    uid: nextLogUid(),
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

export default function TimeEntryView() {
  const { id: publicId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.is_admin ?? false;

  const canApprove = useMemo(() => {
    const mod = me?.modules?.find((m) => m.name === "Time Tracking");
    return Boolean(mod?.can_update);
  }, [me]);

  // === Server-fetched entry ===
  // The API's GET /time-entries/{id} now bundles time_logs, status_history,
  // AND billed_lineage into one response (2026-07-01 perf pass). Previously
  // the page fired a follow-up GET /billed-lineage; that waterfall is gone.
  const { data: entry, isLoading, error } = useQuery<
    TimeEntry & { billed_lineage?: TimeEntryBilledLineageRow[] }
  >({
    queryKey: ["time-entry", publicId],
    queryFn: () =>
      getOne<TimeEntry & { billed_lineage?: TimeEntryBilledLineageRow[] }>(
        `/api/v1/time-entries/${publicId}`,
      ),
    enabled: !!publicId,
  });
  const lineage = entry?.billed_lineage ?? [];

  const users = useEntityList<User>("/api/v1/get/users").items;
  const userMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of users) {
      const name = [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || "Unknown";
      m.set(u.id, name);
    }
    return m;
  }, [users]);
  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        const an = [a.firstname, a.lastname].filter(Boolean).join(" ").toLowerCase();
        const bn = [b.firstname, b.lastname].filter(Boolean).join(" ").toLowerCase();
        return an.localeCompare(bn);
      }),
    [users],
  );

  const projects = useEntityList<Project>("/api/v1/get/projects").items;
  const projectMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects],
  );

  // === Mutable form state (only used when status === 'draft') ===
  const [form, setForm] = useState<HeaderForm | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [pageBusy, setPageBusy] = useState<"submit" | "delete" | "approve" | "reject" | null>(null);
  const [headerError, setHeaderError] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");

  // Guard against pending auto-save firing after a destructive action
  const isSavingRef = useRef(false);
  // Header edit guards:
  // - headerDirtyRef: the user has header edits not yet confirmed by the
  //   server, so the hydrate effect must not clobber them with a stale
  //   autosave response.
  // - headerSaveFailedRef: the last header autosave failed, so Submit must
  //   not proceed with a lost/stale header.
  // - formRef: always-current form snapshot (refs never go stale across an
  //   await, unlike the state captured in a closure).
  const headerDirtyRef = useRef(false);
  const headerSaveFailedRef = useRef(false);
  const formRef = useRef<HeaderForm | null>(null);
  formRef.current = form;

  // Self-heal the list cache: when this View fetches an entry, push the
  // user-visible fields into every cached list page so a stale row (e.g.,
  // status changed via iOS or another tab while the list was cached) is
  // corrected without waiting for a refetch.
  useEffect(() => {
    if (!entry) return;
    queryClient.setQueriesData<{ data: TimeEntry[]; count: number }>(
      { queryKey: ["time-entry-list"] },
      (prev) => {
        if (!prev) return prev;
        let changed = false;
        const next = prev.data.map((e) => {
          if (e.public_id !== entry.public_id) return e;
          if (
            e.current_status === entry.current_status &&
            e.work_date === entry.work_date &&
            e.note === entry.note &&
            e.user_id === entry.user_id
          ) {
            return e;
          }
          changed = true;
          return {
            ...e,
            current_status: entry.current_status,
            work_date: entry.work_date,
            note: entry.note,
            user_id: entry.user_id,
          };
        });
        return changed ? { ...prev, data: next } : prev;
      },
    );
  }, [
    queryClient,
    entry?.public_id,
    entry?.current_status,
    entry?.work_date,
    entry?.note,
    entry?.user_id,
  ]);

  // Hydrate form + logs from server response. Re-runs when entry changes —
  // initial load, header auto-save patching row_version, Submit / Approve /
  // Reject changing current_status, or users finishing load.
  //
  // current_status must be a dep: Submit only inserts a TimeEntryStatus row
  // (no TimeEntry update), so row_version is unchanged after the refetch.
  // Without current_status here the local logs/form would never re-sync with
  // server state on transitions.
  //
  // Logs must NOT be blindly overwritten on every re-run — that would wipe
  // in-progress row edits + reset the dirty flag, silently disabling Save.
  // We merge: preserve any locally-dirty or in-flight rows, refresh clean
  // ones from server, keep unsaved-new rows appended.
  useEffect(() => {
    if (!entry) return;
    const worker = users.find((u) => u.id === entry.user_id);
    setForm((prev) => {
      // If the user is mid-edit, preserve their in-progress header input and
      // only refresh row_version (autoSaveHeader keeps it current too) — a
      // stale autosave response patching the cache must NOT rewind the fields.
      if (prev && headerDirtyRef.current) {
        return { ...prev, row_version: entry.row_version };
      }
      return {
        row_version: entry.row_version,
        user_public_id: worker?.public_id ?? "",
        work_date: entry.work_date ?? "",
        note: entry.note ?? "",
      };
    });
    setLogs((prev) => {
      const incoming = (entry.time_logs ?? []).map(logFromServer);
      if (prev.length === 0) return incoming;
      const merged = incoming.map((serverRow) => {
        const existing = prev.find((r) => r.public_id === serverRow.public_id);
        return existing && (existing.dirty || existing.saving) ? existing : serverRow;
      });
      const unsavedNew = prev.filter((r) => r.public_id == null);
      return [...merged, ...unsavedNew];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.public_id, entry?.row_version, entry?.current_status, users.length]);

  const currentStatus = (entry?.current_status ?? "draft") as TimeEntryStatusValue;
  const isDraft = currentStatus === "draft";
  const isSubmitted = currentStatus === "submitted";
  const isTerminal = currentStatus === "approved" || currentStatus === "rejected" || currentStatus === "billed";

  // === Header auto-save (draft only) ===
  const autoSaveHeader = useCallback(async () => {
    if (!form || !publicId || isSavingRef.current) return;
    // Snapshot exactly what we're about to persist so we can tell, on success,
    // whether the user has typed anything newer while the PUT was in flight.
    const sent = {
      user_public_id: form.user_public_id,
      work_date: form.work_date,
      note: form.note,
    };
    isSavingRef.current = true;
    setHeaderError("");
    try {
      const updated = await put<TimeEntry>(`/api/v1/time-entries/${publicId}`, {
        row_version: form.row_version,
        user_public_id: sent.user_public_id || undefined,
        work_date: sent.work_date,
        note: sent.note || null,
      });
      headerSaveFailedRef.current = false;
      // Clear the dirty guard only if the current form still matches what we
      // sent — if the user kept typing, the newer edit stays dirty (and thus
      // protected from clobber) until its own autosave lands.
      const cur = formRef.current;
      if (
        cur &&
        cur.user_public_id === sent.user_public_id &&
        cur.work_date === sent.work_date &&
        cur.note === sent.note
      ) {
        headerDirtyRef.current = false;
      }
      setForm((prev) => (prev ? { ...prev, row_version: updated.row_version } : prev));
      // Patch the entry cache so the row_version we hold matches what's in cache
      queryClient.setQueryData<TimeEntry | undefined>(["time-entry", publicId], (prev) =>
        prev ? { ...prev, row_version: updated.row_version, work_date: updated.work_date, note: updated.note, user_id: updated.user_id } : prev,
      );
    } catch (err) {
      headerSaveFailedRef.current = true;
      setHeaderError(err instanceof Error ? err.message : "Auto-save failed");
    } finally {
      isSavingRef.current = false;
    }
  }, [form, publicId, queryClient]);

  const { flush: flushAutoSave, cancel: cancelAutoSave } = useAutoSave(
    autoSaveHeader,
    [form?.user_public_id, form?.work_date, form?.note],
    300,
    !!form && !!entry && isDraft,
  );

  // === Guards ===
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

  const workerName = entry.user_id != null ? userMap.get(entry.user_id) ?? "—" : "—";
  const history = entry.status_history ?? [];

  // === Handlers ===
  function onHeaderChange(name: string, value: string) {
    headerDirtyRef.current = true;
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
    // Address this row by its stable uid, not the array index — a concurrent
    // save/delete of another row can reorder the array while we await, and an
    // index-addressed write-back would then land on the wrong row.
    const uid = row.uid;
    const clockInApi = localToApi(row.clock_in);
    if (!clockInApi) {
      setLogs((prev) =>
        prev.map((r) => (r.uid === uid ? { ...r, error: "Clock in is required." } : r)),
      );
      return;
    }
    const clockOutApi = row.clock_out ? localToApi(row.clock_out) : null;
    if (row.clock_out && !clockOutApi) {
      setLogs((prev) =>
        prev.map((r) => (r.uid === uid ? { ...r, error: "Clock out time is invalid." } : r)),
      );
      return;
    }
    // Guard: the log's Clock In date must match this entry's Work Date.
    // Without this, manual edits can produce e.g. a TimeEntry with
    // WorkDate=2026-06-16 holding TimeLogs that clock in on 2026-04-25.
    // Clock Out is allowed to fall on the next day (overnight shifts) —
    // only Clock In anchors the workday.
    const workDate = form?.work_date ?? "";
    const clockInDate = clockInApi.slice(0, 10);
    if (workDate && clockInDate !== workDate) {
      setLogs((prev) =>
        prev.map((r) =>
          r.uid === uid
            ? {
                ...r,
                error: `Clock In date (${clockInDate}) doesn't match this entry's Work Date (${workDate}). Update the Work Date above or the Clock In time so they match.`,
              }
            : r,
        ),
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
      prev.map((r) => (r.uid === uid ? { ...r, saving: true, error: "" } : r)),
    );
    try {
      if (row.public_id) {
        const updated = await put<TimeLog>(`/api/v1/time-logs/${row.public_id}`, {
          ...payload,
          row_version: row.row_version!,
        });
        setLogs((prev) =>
          prev.map((r) =>
            r.uid === uid
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
          prev.map((r) =>
            r.uid === uid
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
        prev.map((r) => (r.uid === uid ? { ...r, saving: false, error: msg } : r)),
      );
    }
  }

  async function deleteLog(index: number) {
    const row = logs[index];
    if (!row) return;
    // Address by stable uid, not array index (safe across the delete's await).
    const uid = row.uid;
    if (!row.public_id) {
      // Unsaved row — just drop it
      setLogs((prev) => prev.filter((r) => r.uid !== uid));
      return;
    }
    if (!window.confirm("Delete this time log? This cannot be undone.")) return;
    setLogs((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, saving: true, error: "" } : r)),
    );
    try {
      await del(`/api/v1/time-logs/${row.public_id}`);
      setLogs((prev) => prev.filter((r) => r.uid !== uid));
      toast("Time log deleted.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      setLogs((prev) =>
        prev.map((r) => (r.uid === uid ? { ...r, saving: false, error: msg } : r)),
      );
    }
  }

  async function refreshAfterStatusChange() {
    await queryClient.invalidateQueries({ queryKey: ["time-entry", publicId] });
    await queryClient.invalidateQueries({ queryKey: ["time-entry-list"] });
    await queryClient.invalidateQueries({ queryKey: ["time-entry-count"] });
  }

  async function handleSubmit() {
    if (logs.some((r) => r.saving)) {
      toast("Wait for time-log changes to finish saving before submitting.", "error");
      return;
    }
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
      // Never submit unless the header is confirmed saved. flushAutoSave()
      // no-ops if a debounced save is already in flight, so checking the
      // failure ref alone isn't enough — headerDirtyRef stays true until a
      // save actually lands (and a failed save never clears it), so it also
      // covers the in-flight-save-fails-after-submit race. handleSubmit's own
      // flush persists pending edits whenever no save is mid-flight, so this
      // only blocks during the brief in-flight window (retry succeeds).
      if (headerSaveFailedRef.current) {
        toast("Your latest change didn't save. Fix it and try again.", "error");
        return;
      }
      if (headerDirtyRef.current) {
        toast("Still saving your changes — try Submit again in a moment.", "error");
        return;
      }
      await post(`/api/v1/time-entries/${publicId}/submit`, {});
      toast("Time entry submitted for review.", "success");
      await refreshAfterStatusChange();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to submit", "error");
    } finally {
      setPageBusy(null);
    }
  }

  async function handleDelete() {
    if (logs.some((r) => r.saving)) {
      toast("Wait for time-log changes to finish saving before deleting.", "error");
      return;
    }
    if (!window.confirm("Delete this time entry and all its logs? This cannot be undone.")) return;
    // Guard against pending auto-save firing after the row is gone
    isSavingRef.current = true;
    cancelAutoSave();
    setPageBusy("delete");
    try {
      await del(`/api/v1/time-entries/${publicId}`);
      toast("Time entry deleted.", "success");
      // Surgically remove from cached list pages so the list mounts
      // with the row already gone (no stale-row flash).
      queryClient.setQueriesData<{ data: TimeEntry[]; count: number }>(
        { queryKey: ["time-entry-list"] },
        (prev) => {
          if (!prev) return prev;
          const filtered = prev.data.filter((e) => e.public_id !== publicId);
          if (filtered.length === prev.data.length) return prev;
          return { ...prev, data: filtered, count: Math.max(0, prev.count - 1) };
        },
      );
      queryClient.removeQueries({ queryKey: ["time-entry", publicId] });
      await queryClient.invalidateQueries({ queryKey: ["time-entry-count"] });
      navigate("/time-entry/list");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete", "error");
      isSavingRef.current = false;
      setPageBusy(null);
    }
  }

  async function doApprove() {
    setPageBusy("approve");
    try {
      await post(`/api/v1/time-entries/${publicId}/approve`, {
        note: approvalNote.trim() || null,
      });
      setApprovalNote("");
      toast("Time entry approved.", "success");
      // Optimistically flip the cached list row to 'approved' before we
      // navigate, so the list mounts with the correct badge — no stale
      // "Submitted" flash while a refetch runs.
      queryClient.setQueriesData<{ data: TimeEntry[]; count: number }>(
        { queryKey: ["time-entry-list"] },
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            data: prev.data.map((e) =>
              e.public_id === publicId ? { ...e, current_status: "approved" } : e,
            ),
          };
        },
      );
      // Counts span multiple filter combos (e.g., status=submitted); safer
      // to invalidate than to guess decrements. Drop the detail cache so a
      // re-open refetches fresh.
      await queryClient.invalidateQueries({ queryKey: ["time-entry-count"] });
      queryClient.removeQueries({ queryKey: ["time-entry", publicId] });
      navigate("/time-entry/list");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to approve", "error");
      setPageBusy(null);
    }
  }

  async function doReject() {
    if (!rejectNote.trim()) {
      toast("Please add a reason for rejection.", "error");
      return;
    }
    setPageBusy("reject");
    try {
      await post(`/api/v1/time-entries/${publicId}/reject`, {
        note: rejectNote.trim(),
      });
      setRejectNote("");
      setRejectOpen(false);
      toast("Time entry rejected and returned to the worker.", "success");
      await refreshAfterStatusChange();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to reject", "error");
    } finally {
      setPageBusy(null);
    }
  }

  // === Render ===
  return (
    <div className="page form-page-wide">
      <PageHeader title={`Time Entry — ${fmtDate(entry.work_date)}`}>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/time-entry/list")}>
          Back to List
        </button>
      </PageHeader>

      {/* Status banner for terminal states */}
      {isTerminal && (
        <div className="detail-section" style={{ background: "var(--color-info-bg, #f0f4f8)", padding: 12, borderRadius: 6 }}>
          This entry is <strong>{STATUS_LABELS[currentStatus]}</strong> and cannot be edited.
          {currentStatus === "approved" && " Reject it to return it to draft for changes."}
        </div>
      )}

      {/* === Header === */}
      <div className="form-card">
        {headerError && <div className="form-error">{headerError}</div>}
        <div className="form-header-grid">
          {isDraft && isAdmin ? (
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
              <div className="detail-value">{workerName}</div>
            </div>
          )}

          {isDraft ? (
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
          ) : (
            <div className="form-group">
              <label>Work Date</label>
              <div className="detail-value">{fmtDate(entry.work_date)}</div>
            </div>
          )}

          <div className="form-group">
            <label>Status</label>
            <div className="detail-value">
              <span className={`status-badge ${STATUS_CLASSES[currentStatus] ?? ""}`}>
                {STATUS_LABELS[currentStatus] ?? currentStatus}
              </span>
            </div>
          </div>

          <div className="full-width">
            <label htmlFor="note">Worker Note</label>
            {isDraft ? (
              <textarea
                id="note"
                name="note"
                value={form.note}
                onChange={(e) => onHeaderChange("note", e.target.value)}
                rows={2}
                placeholder="Optional note about the day…"
              />
            ) : (
              <div className="detail-value">{entry.note || <span className="text-muted">—</span>}</div>
            )}
          </div>
        </div>
      </div>

      {/* === Time Logs === */}
      <div className="form-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Time Logs ({logs.length})</h2>
          {isDraft && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={addLog} disabled={pageBusy !== null}>
              + Add Log
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <p className="text-muted">
            {isDraft ? "No logs yet. Add at least one before submitting." : "No time logs recorded."}
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Type</th>
                <th>Clock In</th>
                <th>Clock Out</th>
                <th style={{ width: 80 }}>Duration</th>
                <th>Project</th>
                <th style={{ minWidth: 320 }}>Note</th>
                <th style={{ width: 60 }}>GPS</th>
                {isDraft && <th style={{ width: 180 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {logs.map((row, index) => {
                const link = gpsLink(row.latitude, row.longitude);
                const projectName =
                  row.project_id !== "" ? projectMap.get(Number(row.project_id)) ?? "—" : "—";
                return (
                  <tr key={row.public_id ?? `new-${index}`} style={{ verticalAlign: "top" }}>
                    <td>
                      {isDraft ? (
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
                      ) : (
                        <span style={{ textTransform: "capitalize" }}>{row.log_type}</span>
                      )}
                    </td>
                    <td>
                      {isDraft ? (
                        <input
                          type="datetime-local"
                          value={row.clock_in}
                          onChange={(e) => setLog(index, { clock_in: e.target.value })}
                          disabled={row.saving}
                        />
                      ) : (
                        fmtTime(row.clock_in.replace("T", " "))
                      )}
                    </td>
                    <td>
                      {isDraft ? (
                        <input
                          type="datetime-local"
                          value={row.clock_out}
                          onChange={(e) => setLog(index, { clock_out: e.target.value })}
                          disabled={row.saving}
                          placeholder="(still clocked in)"
                        />
                      ) : row.clock_out ? (
                        fmtTime(row.clock_out.replace("T", " "))
                      ) : (
                        <em className="text-muted">still clocked in</em>
                      )}
                    </td>
                    <td>{fmtDuration(row.duration)}</td>
                    <td>
                      {isDraft ? (
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
                      ) : (
                        projectName
                      )}
                    </td>
                    <td>
                      {isDraft ? (
                        <textarea
                          value={row.note}
                          onChange={(e) => setLog(index, { note: e.target.value })}
                          disabled={row.saving}
                          placeholder="Optional"
                          rows={3}
                          style={{
                            width: "100%",
                            minHeight: "4.5em",
                            resize: "vertical",
                            fontFamily: "inherit",
                          }}
                        />
                      ) : row.note ? (
                        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {row.note}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {link ? (
                        <a href={link} target="_blank" rel="noopener noreferrer">
                          Map
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    {isDraft && (
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
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* === Billed Lineage (Phase 7c) === */}
      {lineage.length > 0 && (
        <div className="detail-section" style={{ marginTop: 16 }}>
          <h2>Billed Lineage</h2>
          <p className="text-muted" style={{ marginTop: -4, marginBottom: 12 }}>
            What this time entry was aggregated into for billing. Vendor labor
            flows to a Bill; employee labor flows directly to an Invoice.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Work Date</th>
                <th>Worker</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
                <th>Linked To</th>
              </tr>
            </thead>
            <tbody>
              {lineage.map((row) => {
                const laborHref =
                  row.target_table === "ContractLabor"
                    ? `/contract-labor/${row.target_public_id}`
                    : `/employee-labor/${row.target_public_id}`;
                const linkedHref =
                  row.linked_target_table === "Bill"
                    ? `/bill/${row.linked_target_public_id}`
                    : row.linked_target_table === "Invoice"
                      ? `/invoice/${row.linked_target_public_id}`
                      : null;
                return (
                  <tr key={`${row.target_table}-${row.target_id}`}>
                    <td>
                      <Link to={laborHref}>
                        {row.target_table === "ContractLabor" ? "Contract Labor" : "Employee Labor"}
                      </Link>
                    </td>
                    <td>{row.work_date}</td>
                    <td>{row.worker_name ?? `#${row.worker_id}`}</td>
                    <td style={{ textAlign: "right" }}>
                      {row.total_amount ? `$${Number(row.total_amount).toFixed(2)}` : "—"}
                    </td>
                    <td>{row.labor_status}</td>
                    <td>
                      {linkedHref ? (
                        <Link to={linkedHref}>
                          {row.linked_target_table} #{row.linked_target_number ?? row.linked_target_id}
                        </Link>
                      ) : (
                        <span className="text-muted">not yet {row.target_table === "ContractLabor" ? "billed" : "invoiced"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* === Status History === */}
      <div className="detail-section" style={{ marginTop: 16 }}>
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

      {/* === Actions === */}
      {isDraft && (
        <div className="form-actions" style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={pageBusy !== null || logs.some((r) => r.saving)}
          >
            {pageBusy === "submit" ? "Submitting…" : "Submit for Review"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={pageBusy !== null || logs.some((r) => r.saving)}
          >
            {pageBusy === "delete" ? "Deleting…" : "Delete Entry"}
          </button>
        </div>
      )}

      {isSubmitted && canApprove && (
        <div className="detail-section" style={{ marginTop: 16 }}>
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
                  disabled={pageBusy !== null}
                >
                  {pageBusy === "approve" ? "Approving…" : "Approve"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setRejectOpen(true)}
                  disabled={pageBusy !== null}
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
                  disabled={pageBusy !== null || !rejectNote.trim()}
                >
                  {pageBusy === "reject" ? "Rejecting…" : "Confirm Reject"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setRejectOpen(false);
                    setRejectNote("");
                  }}
                  disabled={pageBusy !== null}
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
