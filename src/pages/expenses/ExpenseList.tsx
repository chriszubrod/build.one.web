import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { hasExpensePermission } from "./expensePermissions";
import Pagination from "../../components/Pagination";
import PageHeader from "../../components/PageHeader";
import SegmentedControl from "../../components/ui/SegmentedControl";
import EntryCard from "../../components/ui/EntryCard";
import {
  STATUS_TABS,
  expenseListQuery,
  resolveStatusTab,
  isIsoDate,
  EMPTY_COPY,
  NO_MATCH_COPY,
  SECTION_LABEL,
  type ExpenseStatusTab,
} from "./expenseStatusTabs";
import type { Expense, Vendor } from "../../types/api";
import {
  EXPENSE_STATUS_LABELS,
  expenseReviewBadgeClass,
  expenseReviewKind,
  expenseStatus,
  expenseStatusBadgeClass,
} from "./expenseLifecycle";

function fmtMoney(v: string | null): string {
  if (v === null || v === undefined || v === "") return "$0.00";
  const n = Number(v);
  if (isNaN(n)) return "$0.00";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Card tile initials, same rule LaborList uses for its worker names. */
function abbrev(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "—";
}

function fmtDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

export default function ExpenseList() {
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  // In the URL, like BillList — so a tab is linkable and survives a refresh.
  //
  // NOTE: every write below goes through setParam, which uses { replace: true },
  // so tabbing does NOT accumulate history entries and Back leaves the page
  // rather than stepping through tabs. That is deliberate (a tab flick should
  // not bury the previous page under four entries) but it is the opposite of
  // what this comment claimed before U-470 — the claim was inherited from
  // BillList and was never true.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const statusFilter: ExpenseStatusTab = resolveStatusTab(statusParam);
  /** One writer for every URL-backed filter, so they cannot fight each other. */
  const setParam = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const fromDate = isIsoDate(fromRaw) ? fromRaw : "";
  const toDate = isIsoDate(toRaw) ? toRaw : "";

  const extraParams =
    expenseListQuery(statusFilter) +
    (fromDate ? `&start_date=${encodeURIComponent(fromDate)}` : "") +
    (toDate ? `&end_date=${encodeURIComponent(toDate)}` : "");
  const {
    items, total, page, pageSize, totalPages,
    loading, error, setPage, setSearch, search, reload,
  } = usePaginatedList<Expense>(`/api/v1/get/expenses${extraParams}`, 50, {
    staleWhileRevalidate: true,
    sessionPersistenceKey: "buildOne.expenseList",
  });
  // The TAB is not a "filter" for this purpose — it always has a value, so
  // counting it would leave Clear permanently enabled and the count chip
  // permanently on.
  const hasActiveFilters = Boolean(search || fromDate || toDate);

  // `page` is persisted in sessionStorage and shared across every tab and date
  // combination, but only INTERACTIVE changes reset it. Open a shared
  // `/expense/list?status=draft` link after last leaving the Completed tab on
  // page 40 and the API answers with a real total and an out-of-range, empty
  // page — the UI then says "no expenses match" while expenses plainly match.
  useEffect(() => {
    if (!loading && items.length === 0 && total > 0 && page > 1) setPage(1);
  }, [loading, items.length, total, page, setPage]);

  const clearFilters = () => {
    setSearch("");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("from");
        next.delete("to");
        return next;
      },
      { replace: true },
    );
    setPage(1);
  };

  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);

  if (loading && page === 1 && !search) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader
        title="Expenses"
        count={total}
        createPath={hasExpensePermission(me, "can_create") ? "/expense/create" : undefined}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => reload()}
          disabled={loading}
          title="Fetch the latest expenses from the server"
        >
          Refresh
        </button>
      </PageHeader>

      <SegmentedControl<ExpenseStatusTab>
        options={STATUS_TABS}
        value={statusFilter}
        onChange={(next) => { setParam("status", next); setPage(1); }}
      />

      {/* Search and the date bounds are applied SERVER-SIDE. Narrowing a page
          in JS would leave `count` describing the unfiltered set, which is
          exactly the inconsistency U-447 removed. */}
      <div className="list-filter-bar">
        <div className="list-filter-row">
          <label className="list-filter-field list-filter-field-grow">
            <span className="list-filter-label">Search</span>
            <input
              type="search"
              className="list-filter-input"
              placeholder="Vendor, reference number, memo…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              autoComplete="off"
              aria-label="Search expenses by vendor, reference number or memo"
            />
          </label>
          <label className="list-filter-field">
            <span className="list-filter-label">From</span>
            <input
              type="date"
              className="list-filter-input"
              value={fromDate}
              onChange={(e) => { setParam("from", e.target.value); setPage(1); }}
              aria-label="Expense date from"
            />
          </label>
          <label className="list-filter-field">
            <span className="list-filter-label">To</span>
            <input
              type="date"
              className="list-filter-input"
              value={toDate}
              onChange={(e) => { setParam("to", e.target.value); setPage(1); }}
              aria-label="Expense date to"
            />
          </label>
          <button
            type="button"
            className="list-filter-clear"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            aria-label="Clear all filters"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="section-label-prose list-meta">
        <span>{SECTION_LABEL[statusFilter]}</span>
        {hasActiveFilters && total > 0 && (
          <span className="list-count">
            {items.length} of {total.toLocaleString()}
          </span>
        )}
      </div>

      {/* Gated on `loading`, like BillList. usePaginatedList keeps
          `staleWhileRevalidate` items on a cache MISS — it sets loading but
          never clears `items` — so switching tabs briefly rendered the previous
          tab's expenses underneath the new tab's heading. */}
      {loading && (
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          Loading…
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          {hasActiveFilters ? NO_MATCH_COPY : EMPTY_COPY[statusFilter]}
        </div>
      )}

      {!loading && items.map((expense) => {
        const vendor = vendorMap.get(expense.vendor_id) ?? "";
        const status = expenseStatus(expense);
        const statusLabel = EXPENSE_STATUS_LABELS[status] ?? status;
        const meta = [
          expense.reference_number || "—",
          fmtDate(expense.expense_date),
          expense.is_credit ? "Credit" : null,
        ].filter(Boolean).join(" · ");
        return (
          <EntryCard
            key={expense.public_id}
            projectAbbrev={abbrev(vendor)}
            projectName={vendor || "Unknown vendor"}
            meta={meta}
            duration={fmtMoney(expense.total_amount)}
            badge={
              <>
                <span className={`status-badge ${expenseStatusBadgeClass(status)}`}>
                  {statusLabel}
                </span>
                {/* Same rule as BillList: show the admin-editable review stage
                    only when it says something the lifecycle badge does not.
                    Without this a completed expense renders "Completed · Completed". */}
                {expense.review_status &&
                  expense.review_status !== statusLabel && (
                    <span
                      className={`status-badge ${expenseReviewBadgeClass(expenseReviewKind(expense))}`}
                    >
                      {expense.review_status}
                    </span>
                  )}
              </>
            }
            onClick={() => navigate(`/expense/${expense.public_id}`)}
          />
        );
      })}

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
