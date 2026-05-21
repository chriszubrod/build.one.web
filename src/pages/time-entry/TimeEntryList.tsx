import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

const STORAGE_KEY = "buildOne.timeEntryList.params";
const SCROLL_KEY = "buildOne.timeEntryList.scrollTop";
import { useQuery } from "@tanstack/react-query";
import { ApiError, getList, getOne } from "../../api/client";
import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
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
  // work_date is "YYYY-MM-DD"; render directly (no TZ shift)
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return v;
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

export default function TimeEntryList() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const isAdmin = me?.is_admin ?? false;

  // Restore filters from sessionStorage on mount when URL is empty.
  // Runs once per component instance; the [] deps + ref guard ensure it
  // does not fire again when the URL changes from this very restore.
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

  // Persist URL params (filters + page) so a navigate-back finds them.
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

  // Date inputs use the same debounce pattern as search so picking a start
  // date then an end date in quick succession results in one refetch, not two.
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
    qs.set("sort_by", "WorkDate");
    qs.set("sort_direction", "DESC");
    return qs;
  }, [filterParams, page, pageSize]);

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
    // Navigate-back within this window reuses the cached data instantly
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
  const projectMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [projects],
  );

  const entries = listQuery.data?.data ?? [];
  const totalCount = countQuery.data ?? 0;

  // Scroll restoration: when the user clicks a row we save scrollTop; on
  // mount with rows visible we apply it. Double rAF lets the table render
  // first. One-shot: we clear the saved value after applying.
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

  function handleRowClick(viewPath: string) {
    const sc = document.getElementById("content");
    if (sc) {
      try { sessionStorage.setItem(SCROLL_KEY, String(sc.scrollTop)); } catch { /* ignore */ }
    }
    navigate(viewPath);
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

  if (listQuery.isLoading && !listQuery.data) return <div className="page-loading">Loading...</div>;
  if (listQuery.error) return <div className="page-error">{(listQuery.error as Error).message}</div>;

  return (
    <div className="page">
      <PageHeader
        title="Time Tracking"
        count={totalCount}
        createPath={isAdmin ? "/time-entry/create" : undefined}
        createLabel="New Time Entry"
      />

      <div className="cl-filters">
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
          <label htmlFor="te-status">Status</label>
          <select
            id="te-status"
            value={status}
            onChange={(e) => updateParam("status", e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="billed">Billed</option>
          </select>
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

      {entries.length > 0 ? (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Work Date</th>
                <th>Worker</th>
                <th>Note</th>
                <th>Status</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const current = (entry.current_status ?? "draft") as TimeEntryStatusValue;
                const workerName =
                  entry.user_id != null ? userMap.get(entry.user_id) ?? "—" : "—";
                const viewPath = `/time-entry/${entry.public_id}`;
                const editPath = `/time-entry/${entry.public_id}/edit`;
                return (
                  <tr
                    key={entry.public_id}
                    className="clickable-row"
                    onClick={() => handleRowClick(viewPath)}
                  >
                    <td>{fmtDate(entry.work_date)}</td>
                    <td>{workerName}</td>
                    <td className="text-muted" style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.note ?? ""}
                    </td>
                    <td>
                      <span className={`status-badge ${STATUS_CLASSES[current] ?? ""}`}>
                        {STATUS_LABELS[current] ?? current}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {current === "draft" ? (
                        <Link to={editPath} className="btn btn-secondary btn-sm">
                          Edit
                        </Link>
                      ) : (
                        <Link to={viewPath} className="btn btn-secondary btn-sm">
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
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
