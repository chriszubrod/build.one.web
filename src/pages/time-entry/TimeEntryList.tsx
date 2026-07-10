import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Send } from "lucide-react";

const STORAGE_KEY = "buildOne.timeEntryList.params";
const SCROLL_KEY = "buildOne.timeEntryList.scrollTop";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, getList, getOne, post } from "../../api/client";
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

const STATUS_ORDER: TimeEntryStatusValue[] = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "billed",
];

// Match TodayScreen's compactName so both surfaces render the submit button
// with the same worker label ("Jack V." not "Jack VanOrman").
function compactName(firstname?: string | null, lastname?: string | null): string {
  const f = (firstname ?? "").trim();
  const l = (lastname ?? "").trim();
  if (f && l) return `${f} ${l[0]}.`;
  if (f) return f;
  if (l) return l;
  return "Unknown";
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return v;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Format a "YYYY-MM-DD" work_date as "Mon · Jun 15 · 2026" without any TZ shift.
// Parses digits directly so a Date-constructor UTC-shift can't move the day.
function fmtGroupHeader(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Local Date only used to compute weekday index; no display value taken from it.
  const dt = new Date(y, mo - 1, d);
  const weekday = WEEKDAYS[dt.getDay()] ?? "";
  const month = MONTHS[mo - 1] ?? "";
  return `${weekday} · ${month} ${d} · ${y}`;
}

// "YYYY-MM-DD" for a local Date. iOS-side work_date is already local, so
// the presets here MUST also use local — never .toISOString() (UTC).
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

interface CountEnvelope {
  count: number;
}

type SortField = "WorkDate" | "Worker";
type SortDirection = "ASC" | "DESC";
type DatePreset = "today" | "this-week" | "this-month" | "last-7" | "last-30";

// Compute [start, end] YYYY-MM-DD for a preset. Week starts Monday to match
// how the crew talks about "this week"; iOS uses the same convention.
function datePresetRange(preset: DatePreset): [string, string] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  const start = new Date(today);
  switch (preset) {
    case "today":
      break;
    case "this-week": {
      const dow = today.getDay(); // 0=Sun..6=Sat
      const daysSinceMon = (dow + 6) % 7; // Mon=0..Sun=6
      start.setDate(today.getDate() - daysSinceMon);
      break;
    }
    case "this-month":
      start.setDate(1);
      break;
    case "last-7":
      start.setDate(today.getDate() - 6);
      break;
    case "last-30":
      start.setDate(today.getDate() - 29);
      break;
  }
  return [toYmd(start), toYmd(end)];
}

// Match the current URL start/end against the presets so we can highlight the
// active button on load / after back-nav.
function detectActivePreset(start: string, end: string): DatePreset | null {
  if (!start || !end) return null;
  for (const p of ["today", "this-week", "this-month", "last-7", "last-30"] as DatePreset[]) {
    const [s, e] = datePresetRange(p);
    if (s === start && e === end) return p;
  }
  return null;
}

export default function TimeEntryList() {
  const [params, setParams] = useSearchParams();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.is_admin ?? false;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (params.toString() !== "") return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
    if (saved && saved.length > 0) {
      setParams(new URLSearchParams(saved), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restoredRef.current) return;
    try { sessionStorage.setItem(STORAGE_KEY, params.toString()); } catch { /* ignore */ }
  }, [params]);

  const search = params.get("search") ?? "";
  const status = params.get("status") ?? "";
  const userIdFilter = params.get("user_id") ?? "";
  const projectIdFilter = params.get("project_id") ?? "";
  const startDate = params.get("start_date") ?? "";
  const endDate = params.get("end_date") ?? "";
  const sortBy = ((params.get("sort_by") as SortField) ?? "WorkDate") as SortField;
  const sortDir = ((params.get("sort_dir") as SortDirection) ?? "DESC") as SortDirection;
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.max(1, Number(params.get("page_size") ?? "50") || 50);

  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    setSearchInput(search);
  }, [search]);
  const debouncedSearch = useDebouncedValue(searchInput, 500);
  useEffect(() => {
    if (debouncedSearch === search) return;
    const next = new URLSearchParams(params);
    if (debouncedSearch) next.set("search", debouncedSearch);
    else next.delete("search");
    next.set("page", "1");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const [startInput, setStartInput] = useState(startDate);
  const [endInput, setEndInput] = useState(endDate);
  useEffect(() => { setStartInput(startDate); }, [startDate]);
  useEffect(() => { setEndInput(endDate); }, [endDate]);
  const debouncedStart = useDebouncedValue(startInput, 600);
  const debouncedEnd = useDebouncedValue(endInput, 600);
  useEffect(() => {
    if (debouncedStart === startDate && debouncedEnd === endDate) return;
    const next = new URLSearchParams(params);
    if (debouncedStart) next.set("start_date", debouncedStart);
    else next.delete("start_date");
    if (debouncedEnd) next.set("end_date", debouncedEnd);
    else next.delete("end_date");
    next.set("page", "1");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedStart, debouncedEnd]);

  const activePreset = useMemo(
    () => detectActivePreset(startDate, endDate),
    [startDate, endDate],
  );

  const filterParams = useMemo(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("search_term", search);
    if (status) qs.set("status", status);
    if (userIdFilter) qs.set("user_id", userIdFilter);
    if (projectIdFilter) qs.set("project_id", projectIdFilter);
    if (startDate) qs.set("start_date", startDate);
    if (endDate) qs.set("end_date", endDate);
    return qs;
  }, [search, status, userIdFilter, projectIdFilter, startDate, endDate]);

  const listParams = useMemo(() => {
    const qs = new URLSearchParams(filterParams);
    qs.set("page_number", String(page));
    qs.set("page_size", String(pageSize));
    qs.set("sort_by", sortBy);
    qs.set("sort_direction", sortDir);
    return qs;
  }, [filterParams, page, pageSize, sortBy, sortDir]);

  const listQuery = useQuery({
    queryKey: ["time-entry-list", listParams.toString()],
    queryFn: async () => {
      try {
        return await getList<TimeEntry>(`/api/v1/time-entries?${listParams.toString()}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return { data: [], count: 0 };
        throw err;
      }
    },
    staleTime: 30_000,
  });

  const countQuery = useQuery({
    queryKey: ["time-entry-count", filterParams.toString()],
    queryFn: async () => {
      const res = await getOne<CountEnvelope>(`/api/v1/time-entries/count?${filterParams.toString()}`);
      return res.count ?? 0;
    },
    staleTime: 30_000,
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
  // Parallel map keyed by user id → compact "Firstname L." label used by the
  // per-row Submit button so it reads "Submit Jack V.'s day" like mobile.
  const userCompactMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of users) {
      m.set(u.id, compactName(u.firstname, u.lastname));
    }
    return m;
  }, [users]);
  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        const an = (userMap.get(a.id) ?? "").toLowerCase();
        const bn = (userMap.get(b.id) ?? "").toLowerCase();
        return an.localeCompare(bn);
      }),
    [users, userMap],
  );

  const projects = useEntityList<Project>("/api/v1/get/projects").items;
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects],
  );
  const projectLabelMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of projects) {
      m.set(p.id, (p.abbreviation && p.abbreviation.trim()) || p.name);
    }
    return m;
  }, [projects]);

  const entries = listQuery.data?.data ?? [];
  const totalCount = countQuery.data ?? 0;

  const scrollAppliedRef = useRef(false);
  useEffect(() => {
    if (scrollAppliedRef.current) return;
    if (entries.length === 0) return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(SCROLL_KEY); } catch { /* ignore */ }
    if (!saved) return;
    const top = Number(saved);
    if (!isFinite(top)) return;
    scrollAppliedRef.current = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const sc = document.getElementById("content");
        if (sc) sc.scrollTop = top;
        try { sessionStorage.removeItem(SCROLL_KEY); } catch { /* ignore */ }
      }),
    );
  }, [entries.length]);

  function handleRowLinkClick(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const sc = document.getElementById("content");
    if (sc) {
      try { sessionStorage.setItem(SCROLL_KEY, String(sc.scrollTop)); } catch { /* ignore */ }
    }
  }

  // Fire the detail fetch when the user hovers a row (or touches down on
  // mobile). By the time the click resolves and the router mounts the View,
  // the ~700ms GET /time-entries/{id} is often already resolved from cache.
  // Idempotent: React Query dedupes identical keys, and the 30s staleTime on
  // the View's own query means the fetch is a no-op if already fresh.
  function prefetchEntry(publicId: string) {
    queryClient.prefetchQuery({
      queryKey: ["time-entry", publicId],
      queryFn: () => getOne(`/api/v1/time-entries/${publicId}`),
      staleTime: 30_000,
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasFilters = Boolean(
    search || status || userIdFilter || projectIdFilter || startDate || endDate,
  );

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set("page", "1");
    setParams(next, { replace: true });
  }

  function applyDatePreset(p: DatePreset) {
    const [s, e] = datePresetRange(p);
    const next = new URLSearchParams(params);
    next.set("start_date", s);
    next.set("end_date", e);
    next.set("page", "1");
    setSearchInput(searchInput);
    setStartInput(s);
    setEndInput(e);
    setParams(next, { replace: true });
  }

  function clearDateRange() {
    const next = new URLSearchParams(params);
    next.delete("start_date");
    next.delete("end_date");
    next.set("page", "1");
    setStartInput("");
    setEndInput("");
    setParams(next, { replace: true });
  }

  async function handleSubmitRow(
    e: React.MouseEvent,
    publicId: string,
    workerLabel: string,
    workDate: string,
  ) {
    // Stop the click from bubbling to the row's <Link> — we don't want to
    // navigate away while the confirm dialog is up.
    e.preventDefault();
    e.stopPropagation();
    if (submittingId) return;
    const dateLabel = fmtDate(workDate);
    // Same wording as TodayScreen's team submit, adapted to the row context
    // (a row = one worker's day, so the phrasing carries over cleanly).
    if (
      !confirm(
        `Submit ${workerLabel}'s day on ${dateLabel}? Once submitted, edits go through the back-office review.`,
      )
    )
      return;
    setSubmittingId(publicId);
    try {
      await post(`/api/v1/time-entries/${publicId}/submit`, {});
      toast("Submitted for review", "success");
      queryClient.invalidateQueries({ queryKey: ["time-entry-list"] });
      queryClient.invalidateQueries({ queryKey: ["time-entry-count"] });
      queryClient.invalidateQueries({ queryKey: ["time-entry", publicId] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Submit failed", "error");
    } finally {
      setSubmittingId(null);
    }
  }

  function onSortClick(field: SortField) {
    const next = new URLSearchParams(params);
    if (sortBy === field) {
      next.set("sort_dir", sortDir === "ASC" ? "DESC" : "ASC");
    } else {
      next.set("sort_by", field);
      // Sensible default per column: newest work first, workers A→Z.
      next.set("sort_dir", field === "WorkDate" ? "DESC" : "ASC");
    }
    next.set("page", "1");
    setParams(next, { replace: true });
  }

  function goToPage(p: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(Math.min(Math.max(1, p), totalPages)));
    setParams(next);
  }

  function clearFilters() {
    setParams(new URLSearchParams(), { replace: true });
    setSearchInput("");
    setStartInput("");
    setEndInput("");
  }

  const pageWindow: number[] = [];
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);
  for (let p = startPage; p <= endPage; p++) pageWindow.push(p);

  // Group rows by work_date so a heading appears above each new date within
  // the current page. Only meaningful when sorted by WorkDate — for Worker
  // sort the primary grouping is per-worker and inserting date headers
  // would fragment each worker's block. So we render group headers only
  // when sortBy is WorkDate.
  const showDateGroups = sortBy === "WorkDate";
  const groupCountByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      const k = e.work_date ?? "";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [entries]);

  const sortIndicator = (field: SortField) =>
    sortBy === field ? (sortDir === "ASC" ? " ▲" : " ▼") : "";

  const statusChips: (TimeEntryStatusValue | "")[] = ["", ...STATUS_ORDER];

  if (listQuery.isLoading && !listQuery.data) return <div className="page-loading">Loading...</div>;
  if (listQuery.error) return <div className="page-error">{(listQuery.error as Error).message}</div>;

  return (
    <div className="page te-list-page">
      <PageHeader
        title="Time Tracking"
        count={totalCount}
        createPath={isAdmin ? "/time-entry/create" : undefined}
        createLabel="New Time Entry"
      />

      <div className="te-toolbar">
        <div className="cl-filters te-filters">
          <div className="cl-filter-group">
            <label htmlFor="te-search">Search</label>
            <input
              id="te-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search notes…"
              autoComplete="off"
            />
          </div>
          <div className="cl-filter-group">
            <label htmlFor="te-start">From</label>
            <input
              id="te-start"
              type="date"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
            />
          </div>
          <div className="cl-filter-group">
            <label htmlFor="te-end">To</label>
            <input
              id="te-end"
              type="date"
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
            />
          </div>
          {isAdmin && (
            <div className="cl-filter-group">
              <label htmlFor="te-user">Worker</label>
              <select
                id="te-user"
                value={userIdFilter}
                onChange={(e) => updateParam("user_id", e.target.value)}
              >
                <option value="">All Workers</option>
                {sortedUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {userMap.get(u.id)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="cl-filter-group">
            <label htmlFor="te-project">Project</label>
            <select
              id="te-project"
              value={projectIdFilter}
              onChange={(e) => updateParam("project_id", e.target.value)}
            >
              <option value="">All Projects</option>
              {sortedProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="cl-filter-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={clearFilters}
              disabled={!hasFilters && !searchInput}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="te-quickbar">
          <div className="te-quickbar-group te-date-presets" role="group" aria-label="Date presets">
            <button
              type="button"
              className={`chip ${activePreset === "today" ? "chip-active" : ""}`}
              onClick={() => applyDatePreset("today")}
            >
              Today
            </button>
            <button
              type="button"
              className={`chip ${activePreset === "this-week" ? "chip-active" : ""}`}
              onClick={() => applyDatePreset("this-week")}
            >
              This Week
            </button>
            <button
              type="button"
              className={`chip ${activePreset === "this-month" ? "chip-active" : ""}`}
              onClick={() => applyDatePreset("this-month")}
            >
              This Month
            </button>
            <button
              type="button"
              className={`chip ${activePreset === "last-7" ? "chip-active" : ""}`}
              onClick={() => applyDatePreset("last-7")}
            >
              Last 7d
            </button>
            <button
              type="button"
              className={`chip ${activePreset === "last-30" ? "chip-active" : ""}`}
              onClick={() => applyDatePreset("last-30")}
            >
              Last 30d
            </button>
            {(startDate || endDate) && (
              <button
                type="button"
                className="chip chip-ghost"
                onClick={clearDateRange}
                aria-label="Clear date range"
                title="Clear date range"
              >
                × Dates
              </button>
            )}
          </div>

          <div className="te-quickbar-group te-status-chips" role="group" aria-label="Status filter">
            {statusChips.map((s) => {
              const active = status === s;
              const label = s === "" ? "All" : STATUS_LABELS[s];
              const cls = s === "" ? "" : STATUS_CLASSES[s];
              return (
                <button
                  key={s || "all"}
                  type="button"
                  className={`chip status-chip ${cls} ${active ? "chip-active" : ""}`}
                  onClick={() => updateParam("status", s)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {entries.length > 0 ? (
        <>
          <table className="data-table te-table">
            <thead>
              <tr>
                <th
                  className="sortable-th"
                  onClick={() => onSortClick("WorkDate")}
                  aria-sort={
                    sortBy === "WorkDate"
                      ? sortDir === "ASC"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  Work Date<span className="sort-indicator">{sortIndicator("WorkDate")}</span>
                </th>
                <th
                  className="sortable-th"
                  onClick={() => onSortClick("Worker")}
                  aria-sort={
                    sortBy === "Worker"
                      ? sortDir === "ASC"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  Worker<span className="sort-indicator">{sortIndicator("Worker")}</span>
                </th>
                <th>Project</th>
                <th>Status</th>
                <th className="te-col-actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                const current = (entry.current_status ?? "draft") as TimeEntryStatusValue;
                const workerName =
                  entry.user_id != null ? userMap.get(entry.user_id) ?? "—" : "—";
                const viewPath = `/time-entry/${entry.public_id}`;
                const wd = entry.work_date ?? "";
                const prevWd = i > 0 ? entries[i - 1].work_date ?? "" : "";
                const showGroupHeader = showDateGroups && wd !== prevWd;
                const groupCount = groupCountByDate.get(wd) ?? 0;
                return (
                  <Fragment key={entry.public_id}>
                    {showGroupHeader && (
                      <tr className="te-group-header" aria-hidden="true">
                        <td colSpan={5}>
                          <span className="te-group-header-label">{fmtGroupHeader(wd)}</span>
                          <span className="te-group-header-count">
                            · {groupCount} {groupCount === 1 ? "entry" : "entries"}
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr
                      className="clickable-row"
                      onMouseEnter={() => prefetchEntry(entry.public_id)}
                      onTouchStart={() => prefetchEntry(entry.public_id)}
                    >
                      <td>
                        <Link to={viewPath} className="table-row-link" onClick={handleRowLinkClick}>
                          {fmtDate(entry.work_date)}
                        </Link>
                      </td>
                      <td>
                        <Link to={viewPath} className="table-row-link" onClick={handleRowLinkClick}>
                          {workerName}
                        </Link>
                      </td>
                      <td className="cell-multi-truncate">
                        <Link to={viewPath} className="table-row-link" onClick={handleRowLinkClick}>
                          {(entry.distinct_project_ids ?? [])
                            .map((pid) => projectLabelMap.get(pid) ?? `#${pid}`)
                            .join(", ") || <span className="text-muted">—</span>}
                        </Link>
                      </td>
                      <td>
                        <Link to={viewPath} className="table-row-link" onClick={handleRowLinkClick}>
                          <span className={`status-badge ${STATUS_CLASSES[current] ?? ""}`}>
                            {STATUS_LABELS[current] ?? current}
                          </span>
                        </Link>
                      </td>
                      <td className="te-col-actions">
                        {current === "draft" && (
                          <button
                            type="button"
                            className="submit-button submit-button-row"
                            disabled={submittingId === entry.public_id}
                            onClick={(e) =>
                              handleSubmitRow(
                                e,
                                entry.public_id,
                                entry.user_id != null
                                  ? userCompactMap.get(entry.user_id) ?? "this worker"
                                  : "this worker",
                                entry.work_date ?? "",
                              )
                            }
                          >
                            <Send size={14} strokeWidth={2} />
                            <span>
                              {submittingId === entry.public_id
                                ? "Submitting…"
                                : `Submit ${
                                    entry.user_id != null
                                      ? userCompactMap.get(entry.user_id) ?? ""
                                      : ""
                                  }'s day`}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="cl-pagination">
              <div className="cl-pagination-info">
                Page {page} of {totalPages}
              </div>
              <div className="cl-pagination-controls">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(1)}
                >
                  First
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  Previous
                </button>
                {pageWindow.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`btn btn-sm ${p === page ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => goToPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                >
                  Next
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(totalPages)}
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="cl-empty-state">
          <h3>{hasFilters ? "No Matching Time Entries" : "No Time Entries"}</h3>
          <p>
            {hasFilters
              ? "Try adjusting your filters."
              : "Entries are clocked in from the iOS app and submitted for review."}
          </p>
          {hasFilters && (
            <div className="cl-empty-actions">
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                Clear Filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
