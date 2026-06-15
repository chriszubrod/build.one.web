import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, fetchWithRefresh, getList, getOne, post } from "../../api/client";
import { useEntityList } from "../../hooks/useEntity";
import PageHeader from "../../components/PageHeader";
import type { ContractLabor, Vendor } from "../../types/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const STATUS_TITLES: Record<string, string> = {
  pending_review: "Pending Review",
  ready: "Ready for Billing",
  billed: "Billed",
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending",
  ready: "Ready",
  billed: "Billed",
};

const STATUS_CLASSES: Record<string, string> = {
  pending_review: "pending-review",
  ready: "ready",
  billed: "billed",
};

function fmtHoursHHMM(decimalHours: string | null): string {
  const n = Number(decimalHours ?? 0);
  if (!isFinite(n)) return "00:00";
  const h = Math.trunc(n);
  const m = Math.round((n - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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

async function fetchCount(qs: URLSearchParams): Promise<number> {
  const res = await getOne<CountEnvelope>(`/api/v1/contract-labor/count?${qs.toString()}`);
  return res.count ?? 0;
}

async function regeneratePdfBlob(publicIds: string[]): Promise<Blob> {
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetchWithRefresh(`${API_BASE}/api/v1/contract-labor/billing/regenerate-pdf`, () => ({
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ public_ids: publicIds }),
  }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail ?? "PDF generation failed");
  }
  return res.blob();
}

export default function ContractLaborList() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // URL-driven state (URL is the source of truth)
  const search = params.get("search") ?? "";
  const status = params.get("status") ?? "";
  const vendorId = params.get("vendor_id") ?? "";
  const billingPeriod = params.get("billing_period") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const pageSize = Math.max(1, Number(params.get("page_size") ?? "25") || 25);

  // Local search input that debounces into the URL
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

  // Selection state — keyed by public_id
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pdfBusy, setPdfBusy] = useState(false);

  // Build server-side filter querystring (shared by list + count queries)
  const filterParams = useMemo(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("search_term", search);
    if (status) qs.set("status", status);
    if (vendorId) qs.set("vendor_id", vendorId);
    if (billingPeriod) qs.set("billing_period_start", billingPeriod);
    return qs;
  }, [search, status, vendorId, billingPeriod]);

  const listParams = useMemo(() => {
    const qs = new URLSearchParams(filterParams);
    qs.set("page_number", String(page));
    qs.set("page_size", String(pageSize));
    qs.set("sort_by", "WorkDate");
    qs.set("sort_direction", "DESC");
    return qs;
  }, [filterParams, page, pageSize]);

  const listQuery = useQuery({
    queryKey: ["contract-labor-list", listParams.toString()],
    queryFn: async () => {
      try {
        return await getList<ContractLabor>(`/api/v1/contract-labor?${listParams.toString()}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return { data: [], count: 0 };
        throw err;
      }
    },
  });

  const countQuery = useQuery({
    queryKey: ["contract-labor-count", filterParams.toString()],
    queryFn: () => fetchCount(filterParams),
  });

  const periodsQuery = useQuery({
    queryKey: ["contract-labor-billing-periods"],
    queryFn: async () => {
      try {
        return await getList<string>("/api/v1/contract-labor/billing-periods");
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return { data: [], count: 0 };
        throw err;
      }
    },
  });

  const vendors = useEntityList<Vendor>("/api/v1/get/vendors").items;
  const vendorMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const v of vendors) m.set(v.id, v.name);
    return m;
  }, [vendors]);
  const sortedVendors = useMemo(
    () => [...vendors].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [vendors],
  );

  // Helper to pick the user-facing worker name for an entry. employee_name
  // is what the worker is actually called (matches User.firstname +
  // User.lastname); Vendor.name may be the more formal legal name (e.g.,
  // "Ricardo Moreno" when the worker goes by "Ricky"). Prefer employee_name;
  // fall back to vendor.name; fall back to "Unknown" so sort stays stable.
  function workerLabelFor(entry: ContractLabor): string {
    if (entry.employee_name && entry.employee_name.trim()) return entry.employee_name;
    if (entry.vendor_id) {
      const v = vendorMap.get(entry.vendor_id);
      if (v) return v;
    }
    return "Unknown";
  }

  // Sort client-side by worker first name ASC. employee_name is rendered
  // "Firstname Lastname …", so a plain string sort yields first-name order.
  // For typical billing-period filtered views (~10-25 entries), this fits
  // on one page; pagination won't fragment the alphabetical order in practice.
  const entries = useMemo(() => {
    const rows = listQuery.data?.data ?? [];
    return [...rows].sort((a, b) =>
      workerLabelFor(a).localeCompare(workerLabelFor(b), undefined, { sensitivity: "base" })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.data, vendorMap]);
  const totalCount = countQuery.data ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasFilters = Boolean(search || status || vendorId || billingPeriod);
  const billingPeriods = periodsQuery.data?.data ?? [];

  // Reset selection when the visible page changes
  useEffect(() => {
    setSelected(new Set());
  }, [listParams]);

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
  }

  function toggleSelectAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(entries.map((e) => e.public_id)));
  }

  function toggleRow(publicId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(publicId);
      else next.delete(publicId);
      return next;
    });
  }

  function invalidateLists() {
    queryClient.invalidateQueries({ queryKey: ["contract-labor-list"] });
    queryClient.invalidateQueries({ queryKey: ["contract-labor-count"] });
    queryClient.invalidateQueries({ queryKey: ["contract-labor-billing-periods"] });
  }

  async function bulkMarkReady() {
    const public_ids = Array.from(selected);
    if (public_ids.length === 0) return;
    try {
      const result = await post<{ success_count: number; error_count: number }>(
        "/api/v1/contract-labor/bulk-mark-ready",
        { public_ids },
      );
      const msg = result.error_count
        ? `Marked ${result.success_count} as ready; ${result.error_count} had errors.`
        : `Marked ${result.success_count} as ready.`;
      window.alert(msg);
      setSelected(new Set());
      invalidateLists();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to mark as ready");
    }
  }

  async function bulkDelete() {
    const public_ids = Array.from(selected);
    if (public_ids.length === 0) return;
    if (!window.confirm(`Delete ${public_ids.length} entries? This cannot be undone.`)) return;
    try {
      const result = await post<{ success_count: number; error_count: number }>(
        "/api/v1/contract-labor/bulk-delete",
        { public_ids },
      );
      const msg = result.error_count
        ? `Deleted ${result.success_count}; ${result.error_count} could not be deleted.`
        : `Deleted ${result.success_count}.`;
      window.alert(msg);
      setSelected(new Set());
      invalidateLists();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function viewPdf() {
    const public_ids = Array.from(selected);
    if (public_ids.length === 0) return;
    setPdfBusy(true);
    try {
      const blob = await regeneratePdfBlob(public_ids);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setPdfBusy(false);
    }
  }

  const title = STATUS_TITLES[status] ?? "Contract Labor";
  const generateBillsHref = billingPeriod
    ? `/contract-labor/bills?billing_period=${encodeURIComponent(billingPeriod)}`
    : "/contract-labor/bills";

  const selectionCount = selected.size;
  const allOnPageSelected = entries.length > 0 && entries.every((e) => selected.has(e.public_id));
  const someOnPageSelected = entries.some((e) => selected.has(e.public_id));

  // Numbered page window (current ± 2)
  const pageWindow: number[] = [];
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, page + 2);
  for (let p = startPage; p <= endPage; p++) pageWindow.push(p);

  if (listQuery.isLoading && !listQuery.data) return <div className="page-loading">Loading...</div>;
  if (listQuery.error) return <div className="page-error">{(listQuery.error as Error).message}</div>;

  return (
    <div className="page">
      <PageHeader title={title} count={totalCount}>
        <Link to="/contract-labor/import" className="btn btn-secondary">
          Import Excel
        </Link>
        <Link to={generateBillsHref} className="btn btn-secondary">
          Generate Bills
        </Link>
      </PageHeader>

      {/* Filter bar */}
      <div className="cl-filters">
        <div className="cl-filter-group">
          <label htmlFor="cl-search">Search</label>
          <input
            id="cl-search"
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, notes..."
            autoComplete="off"
          />
        </div>
        <div className="cl-filter-group">
          <label htmlFor="cl-status">Status</label>
          <select
            id="cl-status"
            value={status}
            onChange={(e) => updateParam("status", e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="pending_review">Pending Review</option>
            <option value="ready">Ready for Billing</option>
            <option value="billed">Billed</option>
          </select>
        </div>
        <div className="cl-filter-group">
          <label htmlFor="cl-period">Billing Period</label>
          <select
            id="cl-period"
            value={billingPeriod}
            onChange={(e) => updateParam("billing_period", e.target.value)}
          >
            <option value="">All Periods</option>
            {billingPeriods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="cl-filter-group">
          <label htmlFor="cl-vendor">Vendor</label>
          <select
            id="cl-vendor"
            value={vendorId}
            onChange={(e) => updateParam("vendor_id", e.target.value)}
          >
            <option value="">All Vendors</option>
            {sortedVendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
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

      {/* Bulk actions */}
      {entries.length > 0 && (
        <div className="cl-bulk-actions">
          <div className="cl-bulk-left">
            <input
              type="checkbox"
              id="cl-select-all"
              checked={allOnPageSelected}
              ref={(el) => {
                if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
              }}
              onChange={(e) => toggleSelectAll(e.target.checked)}
            />
            <label htmlFor="cl-select-all">Select All</label>
            <span className="cl-selected-count">({selectionCount} selected)</span>
          </div>
          <div className="cl-bulk-right">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={selectionCount === 0}
              onClick={bulkDelete}
            >
              Delete Selected
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={selectionCount === 0}
              onClick={bulkMarkReady}
            >
              Mark as Ready
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={selectionCount === 0 || pdfBusy}
              onClick={viewPdf}
            >
              {pdfBusy ? "Generating..." : "View PDF"}
            </button>
          </div>
        </div>
      )}

      {/* Results summary */}
      {entries.length > 0 && (
        <div className="cl-results-summary">
          <span>
            Showing {entries.length} of {totalCount} entries
          </span>
          {totalPages > 1 && (
            <span>
              {" "}
              • Page {page} of {totalPages}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {entries.length > 0 ? (
        <>
          <table className="data-table cl-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Job</th>
                <th>Hours</th>
                <th>Status</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const vendorName = workerLabelFor(entry);
                const editPath = `/contract-labor/${entry.public_id}/edit`;
                return (
                  <tr
                    key={entry.public_id}
                    className="clickable-row"
                    onClick={() => navigate(editPath)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(entry.public_id)}
                        onChange={(e) => toggleRow(entry.public_id, e.target.checked)}
                      />
                    </td>
                    <td>{entry.work_date || "N/A"}</td>
                    <td>
                      <strong>{vendorName}</strong>
                      {/* Source badge — only renders when the backend has
                          surfaced source_time_entry_id (defensive: the
                          field is optional in the type so we degrade
                          silently if absent). */}
                      {entry.source_time_entry_id !== undefined && (
                        entry.source_time_entry_id != null ? (
                          <span
                            className="status-badge"
                            title="Aggregated from a TimeEntry"
                            style={{ marginLeft: 8, fontSize: "0.7em" }}
                          >
                            TT
                          </span>
                        ) : (
                          <span
                            className="status-badge"
                            title="Imported from Excel"
                            style={{ marginLeft: 8, fontSize: "0.7em", opacity: 0.6 }}
                          >
                            XLS
                          </span>
                        )
                      )}
                    </td>
                    <td>{entry.job_name || "—"}</td>
                    <td>{fmtHoursHHMM(entry.total_hours)}</td>
                    <td>
                      <span className={`status-badge ${STATUS_CLASSES[entry.status] ?? ""}`}>
                        {STATUS_LABELS[entry.status] ?? entry.status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Link to={editPath} className="btn btn-secondary btn-sm">
                        Edit
                      </Link>
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
          <h3>{hasFilters ? "No Matching Entries" : "No Contract Labor Entries"}</h3>
          <p>{hasFilters ? "Try adjusting your filters or import new data." : "Import an Excel file to get started."}</p>
          <div className="cl-empty-actions">
            <Link to="/contract-labor/import" className="btn btn-primary">
              Import Excel
            </Link>
            {hasFilters && (
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
