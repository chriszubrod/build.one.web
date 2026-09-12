import { useState, useCallback, useEffect, useRef, type DragEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import { uploadFile, getOne, rawRequest } from "../../api/client";
import Pagination from "../../components/Pagination";
import PageHeader from "../../components/PageHeader";
import SegmentedControl from "../../components/ui/SegmentedControl";
import EntryCard from "../../components/ui/EntryCard";
import {
  DEFAULT_STATUS_TAB,
  STATUS_TABS,
  billListQuery,
  isStatusTab,
  isIsoDate,
  EMPTY_COPY,
  NO_MATCH_COPY,
  SECTION_LABEL,
  type BillStatusTab,
} from "./billStatusTabs";
import type { Bill, Vendor } from "../../types/api";
import {
  DOCUMENT_STATUS_LABELS,
  documentReviewBadgeClass,
  documentReviewKind,
  documentStatus,
  documentStatusBadgeClass,
} from "../../shared/documentLifecycle";

interface FolderSummary {
  is_linked: boolean;
  folder_name?: string;
  folder_web_url?: string;
  file_count?: number;
}

function fmtMoney(v: string | null): string {
  if (v === null || v === undefined || v === "") return "$0.00";
  const n = Number(v);
  if (isNaN(n)) return "$0.00";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
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

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PendingFile {
  file: File;
  uploading: boolean;
  error: string;
}

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"];

export default function BillList() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  // In the URL, like LaborList — so a tab is linkable, survives a refresh, and
  // the back button steps through tabs rather than leaving the page.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const statusFilter: BillStatusTab = isStatusTab(statusParam)
    ? statusParam
    : DEFAULT_STATUS_TAB;
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
  const fromDate = isIsoDate(fromRaw) ? fromRaw! : "";
  const toDate = isIsoDate(toRaw) ? toRaw! : "";
  const [folderSummary, setFolderSummary] = useState<FolderSummary | null>(null);
  const [processingFolder, setProcessingFolder] = useState(false);
  const [folderProgress, setFolderProgress] = useState<{ total: number; done: number; currentFile: string | null } | null>(null);

  const refreshFolderSummary = useCallback(() => {
    getOne<FolderSummary>("/api/v1/get/bill-folder-summary")
      .then((data) => setFolderSummary(data))
      .catch(() => setFolderSummary(null));
  }, []);

  useEffect(() => { refreshFolderSummary(); }, [refreshFolderSummary]);

  const handleProcessFolder = async () => {
    setProcessingFolder(true);
    setFolderProgress(null);
    try {
      const { run_id } = await rawRequest<{ status: string; run_id: string; files_queued: number }>(
        "/api/v1/process/bill-folder",
        { method: "POST" },
      );

      const poll = async () => {
        const data = await rawRequest<{
          status: string;
          files_total?: number;
          files_processed?: number;
          files_skipped?: number;
          files_failed?: number;
          files_queued?: number;
          current_file?: string | null;
          errors?: string[];
        }>(`/api/v1/process/bill-folder/${run_id}`);

        setFolderProgress({
          total: data.files_total ?? 0,
          done: (data.files_processed ?? 0) + (data.files_skipped ?? 0) + (data.files_failed ?? 0),
          currentFile: data.current_file ?? null,
        });

        if (data.status === "processing" || data.status === "queued") {
          setTimeout(poll, 2000);
        } else {
          setProcessingFolder(false);
          setFolderProgress(null);
          refreshFolderSummary();
          reload();
        }
      };
      setTimeout(poll, 2000);
    } catch {
      setProcessingFolder(false);
      setFolderProgress(null);
    }
  };

  const extraParams =
    billListQuery(statusFilter) +
    (fromDate ? `&start_date=${encodeURIComponent(fromDate)}` : "") +
    (toDate ? `&end_date=${encodeURIComponent(toDate)}` : "");
  const {
    items, total, page, pageSize, totalPages,
    loading, error, setPage, setSearch, search, reload,
  } = usePaginatedList<Bill>(`/api/v1/get/bills${extraParams}`, 50, {
    staleWhileRevalidate: true,
    sessionPersistenceKey: "buildOne.billList",
  });
  // The TAB is not a "filter" for this purpose — it always has a value, so
  // counting it would leave Clear permanently enabled and the count chip
  // permanently on.
  const hasActiveFilters = Boolean(search || fromDate || toDate);

  // `page` is persisted in sessionStorage and shared across every tab and date
  // combination, but only INTERACTIVE changes reset it (Codex P1). Open a
  // shared `/bills?status=draft` link after last leaving the Completed tab on
  // page 40 and the API answers with a real total and an out-of-range, empty
  // page — the UI then says "no bills match" while bills plainly match.
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
  const projectMap = useIdNameMap<{ id: number; name: string }>("/api/v1/get/projects", (p) => p.name);

  // Resolve vendor + project names for the card face.
  const resolvedItems = items.map((bill) => ({
    ...bill,
    _vendor: vendorMap.get(bill.vendor_id) ?? "",
    _project: projectMap.get((bill as any).project_id) ?? "",
    _date: bill.bill_date ?? "",
    _amount: bill.total_amount ? Number(bill.total_amount) : 0,
  }));

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: PendingFile[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) continue;
      const alreadyAdded = pendingFiles.some(
        (p) => p.file.name === file.name && p.file.size === file.size,
      );
      if (!alreadyAdded) {
        newFiles.push({ file, uploading: false, error: "" });
      }
    }
    if (newFiles.length > 0) {
      setPendingFiles((prev) => [...prev, ...newFiles]);
    }
  }, [pendingFiles]);

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => setPendingFiles([]);

  const createBillFromFile = async (index: number) => {
    const entry = pendingFiles[index];
    if (!entry || entry.uploading) return;

    setPendingFiles((prev) =>
      prev.map((p, i) => (i === index ? { ...p, uploading: true, error: "" } : p)),
    );

    try {
      const result = await uploadFile<{ token: string }>(
        "/api/v1/temp/pending-bill-file",
        entry.file,
      );
      setPendingFiles((prev) => prev.filter((_, i) => i !== index));
      navigate(`/bill/create?pendingFileToken=${encodeURIComponent(result.token)}`);
    } catch (err: any) {
      setPendingFiles((prev) =>
        prev.map((p, i) =>
          i === index ? { ...p, uploading: false, error: err.message } : p,
        ),
      );
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  if (loading && page === 1 && !search) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Bills" count={total} createPath="/bill/create">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => reload()}
          disabled={loading}
          title="Fetch the latest bills from the server"
        >
          Refresh
        </button>
      </PageHeader>

      {/* SharePoint folder summary */}
      {folderSummary?.is_linked && (
        <div className="folder-summary">
          <div className="folder-summary-info">
            <span className="folder-summary-icon">📂</span>
            <div>
              <span className="folder-summary-name">{folderSummary.folder_name ?? "Source Folder"}</span>
              <span className="folder-summary-count">
                {folderSummary.file_count} file{folderSummary.file_count !== 1 ? "s" : ""} to process
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(folderSummary.file_count ?? 0) > 0 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={processingFolder}
                onClick={handleProcessFolder}
                title={folderProgress?.currentFile ?? undefined}
              >
                {processingFolder
                  ? folderProgress && folderProgress.total > 0
                    ? `Processing ${folderProgress.done}/${folderProgress.total}...`
                    : "Processing..."
                  : "Process Folder"}
              </button>
            )}
            {folderSummary.folder_web_url && (
              <a
                href={folderSummary.folder_web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                onClick={(e) => e.stopPropagation()}
              >
                Open in SharePoint
              </a>
            )}
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`drop-zone ${dragOver ? "drop-zone-active" : ""}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="drop-zone-icon">📁</span>
        <p className="drop-zone-text">Drag & drop bill files here</p>
        <p className="drop-zone-subtext">
          or{" "}
          <button
            type="button"
            className="drop-zone-browse"
            onClick={() => fileInputRef.current?.click()}
          >
            browse files
          </button>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
      </div>

      {/* Pending files table */}
      {pendingFiles.length > 0 && (
        <div className="pending-files">
          <div className="pending-files-header">
            <h3>Files Ready for Import ({pendingFiles.length})</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearAllFiles}>
              Clear All
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Size</th>
                <th>Type</th>
                <th style={{ width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingFiles.map((entry, idx) => (
                <tr key={`${entry.file.name}-${idx}`}>
                  <td>{entry.file.name}</td>
                  <td>{fmtSize(entry.file.size)}</td>
                  <td>{entry.file.type.split("/")[1]?.toUpperCase() ?? entry.file.type}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => createBillFromFile(idx)}
                        disabled={entry.uploading}
                      >
                        {entry.uploading ? "Uploading..." : "Create Bill"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => removeFile(idx)}
                        disabled={entry.uploading}
                      >
                        Remove
                      </button>
                    </div>
                    {entry.error && (
                      <div style={{ color: "var(--color-error)", fontSize: 12, marginTop: 4 }}>
                        {entry.error}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SegmentedControl<BillStatusTab>
        options={STATUS_TABS}
        value={statusFilter}
        onChange={(next) => { setParam("status", next); setPage(1); }}
      />

      {/* Labor's filter bar (U-452). Search and the date bounds are applied
          SERVER-SIDE, unlike LaborList which filters its fully-fetched status
          set in the browser — that shape cannot work here. Narrowing a page in
          JS would leave `count` describing the unfiltered set, which is exactly
          the inconsistency U-447 removed. */}
      <div className="list-filter-bar">
        <div className="list-filter-row">
          <label className="list-filter-field list-filter-field-grow">
            <span className="list-filter-label">Search</span>
            <input
              type="search"
              className="list-filter-input"
              placeholder="Vendor, bill number, memo…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              autoComplete="off"
              aria-label="Search bills by vendor, bill number or memo"
            />
          </label>
          <label className="list-filter-field">
            <span className="list-filter-label">From</span>
            <input
              type="date"
              className="list-filter-input"
              value={fromDate}
              onChange={(e) => { setParam("from", e.target.value); setPage(1); }}
              aria-label="Bill date from"
            />
          </label>
          <label className="list-filter-field">
            <span className="list-filter-label">To</span>
            <input
              type="date"
              className="list-filter-input"
              value={toDate}
              onChange={(e) => { setParam("to", e.target.value); setPage(1); }}
              aria-label="Bill date to"
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

      {/* Gated on `loading`, like LaborList (Codex P2). usePaginatedList keeps
          `staleWhileRevalidate` items on a cache MISS — it sets loading but
          never clears `items` — so switching tabs briefly rendered the previous
          tab's bills underneath the new tab's heading. A bill shown under the
          wrong lifecycle heading is worse than a flash of "Loading…". */}
      {loading && (
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          Loading…
        </div>
      )}

      {!loading && resolvedItems.length === 0 && (
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          {hasActiveFilters ? NO_MATCH_COPY : EMPTY_COPY[statusFilter]}
        </div>
      )}

      {!loading && resolvedItems.map((bill) => {
        const status = documentStatus(bill);
        const meta = [
          bill.bill_number || "—",
          fmtDate(bill.bill_date),
          bill._project || "No project",
        ].join(" · ");
        return (
          <EntryCard
            key={bill.public_id}
            projectAbbrev={abbrev(bill._vendor)}
            projectName={bill._vendor || "Unknown vendor"}
            meta={meta}
            duration={fmtMoney(bill.total_amount)}
            badge={
              <>
                <span className={`status-badge ${documentStatusBadgeClass(status)}`}>
                  {DOCUMENT_STATUS_LABELS[status] ?? status}
                </span>
                {/* The table carried Status AND Review as separate columns.
                    Dropping the second was an unflagged loss: `review_status`
                    is the ADMIN-EDITABLE stage name, so once someone adds a
                    custom stage it is the only place that stage is visible —
                    the lifecycle badge collapses every intermediate one to
                    "In Review". Shown only when it says something the status
                    badge does not. */}
                {bill.review_status &&
                  bill.review_status !== (DOCUMENT_STATUS_LABELS[status] ?? status) && (
                    <span
                      className={`status-badge ${documentReviewBadgeClass(documentReviewKind(bill))}`}
                    >
                      {bill.review_status}
                    </span>
                  )}
              </>
            }
            onClick={() => navigate(`/bill/${bill.public_id}`)}
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
