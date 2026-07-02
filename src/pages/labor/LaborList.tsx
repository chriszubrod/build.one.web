import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { getList } from "../../api/client";
import NavHeader from "../../components/ui/NavHeader";
import EntryCard from "../../components/ui/EntryCard";
import SegmentedControl from "../../components/ui/SegmentedControl";
import type { ContractLabor } from "../../types/api";

function fmtIsoDate(s: string | null | undefined): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtMoney(s: string | null | undefined): string {
  if (s === null || s === undefined || s === "") return "$0.00";
  const n = Number(s);
  if (isNaN(n)) return "$0.00";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtHours(s: string | null | undefined): string {
  if (s === null || s === undefined || s === "") return "0.00h";
  const n = Number(s);
  if (isNaN(n)) return "0.00h";
  return `${n.toFixed(2)}h`;
}

function abbrev(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "—";
}

// Interim vocab (2026-07-02): 'submitted' shim added alongside legacy
// pending_review / ready / billed. Full rename (pending_review → draft;
// ready → approved; billed → completed) lands in a follow-up.
type LaborStatus = "pending_review" | "submitted" | "ready" | "billed";

const STATUS_OPTIONS: { value: LaborStatus; label: string }[] = [
  { value: "pending_review", label: "Pending" },
  { value: "submitted", label: "Submitted" },
  { value: "ready", label: "Ready" },
  { value: "billed", label: "Billed" },
];

const SECTION_LABEL: Record<LaborStatus, string> = {
  pending_review: "Pending review",
  submitted: "Submitted for review",
  ready: "Ready for billing",
  billed: "Billed",
};

const EMPTY_COPY: Record<LaborStatus, string> = {
  pending_review: "Nothing to review.",
  submitted: "Nothing awaiting reviewer reply.",
  ready: "Nothing ready for billing.",
  billed: "Nothing billed yet.",
};

const NO_MATCH_COPY = "No matching entries.";

export default function LaborList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<LaborStatus>("pending_review");
  const [nameFilter, setNameFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const laborQuery = useQuery<ContractLabor[]>({
    queryKey: ["contract-labor", "by-status", status],
    queryFn: async () =>
      (await getList<ContractLabor>(`/api/v1/contract-labor/by-status/${status}`)).data,
  });

  const hasActiveFilters =
    nameFilter.trim() !== "" || fromDate !== "" || toDate !== "";

  const sorted = useMemo<ContractLabor[]>(() => {
    const needle = nameFilter.trim().toLowerCase();
    const rows = (laborQuery.data ?? []).slice();
    // Date-range filter on work_date (YYYY-MM-DD lexicographic compare works
    // because the format sorts naturally). Both bounds are inclusive; either
    // can be empty (means "no lower / upper bound").
    const filtered = rows.filter((r) => {
      const wd = (r.work_date ?? "").slice(0, 10);
      if (fromDate && (!wd || wd < fromDate)) return false;
      if (toDate && (!wd || wd > toDate)) return false;
      if (needle && !(r.employee_name ?? "").toLowerCase().includes(needle))
        return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const ad = a.work_date ?? "";
      const bd = b.work_date ?? "";
      if (ad !== bd) return bd.localeCompare(ad);
      return (a.employee_name ?? "").localeCompare(b.employee_name ?? "");
    });
  }, [laborQuery.data, nameFilter, fromDate, toDate]);

  function clearFilters() {
    setNameFilter("");
    setFromDate("");
    setToDate("");
  }

  const totalRows = laborQuery.data?.length ?? 0;
  const showingRows = sorted.length;
  const showCountChip = hasActiveFilters && totalRows > 0;

  return (
    <div className="ios-page labor-list-page">
      <NavHeader
        title="Labor review"
        rightAction={
          <Link
            to="/contract-labor/bills"
            className="labor-generate-bills-button"
            aria-label="Open Generate Bills page"
          >
            <FileText size={16} strokeWidth={2} />
            <span>Generate Bills</span>
          </Link>
        }
      />

      <SegmentedControl<LaborStatus>
        options={STATUS_OPTIONS}
        value={status}
        onChange={setStatus}
      />

      <div className="labor-filter-bar">
        <div className="labor-filter-row">
          <label className="labor-filter-field labor-filter-field-grow">
            <span className="labor-filter-label">Name</span>
            <input
              type="search"
              className="labor-filter-input"
              placeholder="Filter by name…"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              autoComplete="off"
              aria-label="Filter labor entries by worker name"
            />
          </label>
          <label className="labor-filter-field">
            <span className="labor-filter-label">From</span>
            <input
              type="date"
              className="labor-filter-input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="Work date from"
            />
          </label>
          <label className="labor-filter-field">
            <span className="labor-filter-label">To</span>
            <input
              type="date"
              className="labor-filter-input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="Work date to"
            />
          </label>
          <button
            type="button"
            className="labor-filter-clear"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            aria-label="Clear all filters"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="section-label-prose labor-list-meta">
        <span>{SECTION_LABEL[status]}</span>
        {showCountChip && (
          <span className="labor-list-count">
            {showingRows} of {totalRows}
          </span>
        )}
      </div>

      {laborQuery.isLoading && (
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          Loading…
        </div>
      )}

      {!laborQuery.isLoading && sorted.length === 0 && (
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          {hasActiveFilters && totalRows > 0 ? NO_MATCH_COPY : EMPTY_COPY[status]}
        </div>
      )}

      {sorted.map((cl) => {
        const hoursNum = Number(cl.total_hours ?? 0);
        const rateNum = Number(cl.hourly_rate ?? 0);
        const amount =
          isNaN(hoursNum) || isNaN(rateNum) ? 0 : hoursNum * rateNum;
        const meta = `${fmtIsoDate(cl.work_date)} · ${fmtHours(cl.total_hours)} · Amount ${fmtMoney(String(amount))}`;
        const duration = `Price ${fmtMoney(cl.total_amount)}`;
        return (
          <EntryCard
            key={cl.public_id}
            projectAbbrev={abbrev(cl.employee_name ?? "—")}
            projectName={cl.employee_name ?? "Unknown worker"}
            meta={meta}
            duration={duration}
            onClick={() => navigate(`/labor/${cl.public_id}`)}
          />
        );
      })}
    </div>
  );
}
