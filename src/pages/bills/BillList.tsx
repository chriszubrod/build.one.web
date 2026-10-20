import { useState, useCallback, useEffect, useRef, type DragEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import Pagination from "../../components/Pagination";
import PageHeader from "../../components/PageHeader";
import SegmentedControl from "../../components/ui/SegmentedControl";
import EntryCard from "../../components/ui/EntryCard";
import { useToast } from "../../components/Toast";
import { uploadFile, post, ApiError, OfflineError } from "../../api/client";
import type { BillDraftFromAttachmentResponse } from "../../types/api";
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

type PendingRowStatus = "pending" | "uploading" | "reading" | "done" | "error";

interface PendingFile {
  id: string;
  file: File;
  status: PendingRowStatus;
  /** True when exactly one PDF was accepted in this row's drop/select batch. */
  soloBatch: boolean;
  /** Enqueue generation — solo navigation only when this still matches the latest enqueue. */
  enqueueSeq: number;
  bill_public_id?: string;
  existing?: boolean;
  existing_reason?: BillDraftFromAttachmentResponse["existing_reason"];
  error?: string;
}

const NON_PDF_MESSAGE = "Only PDF files can become draft bills here.";

const ROW_STATUS_LABELS: Record<PendingRowStatus, string> = {
  pending: "Queued",
  uploading: "Uploading…",
  reading: "Reading…",
  done: "Done",
  error: "Error",
};

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** User-facing copy for draft-from-attachment failures (never raw server detail). */
export function draftAttachmentErrorMessage(err: unknown): string {
  if (err instanceof OfflineError) {
    return "You're offline — try again when connected.";
  }
  if (err instanceof ApiError) {
    if (err.status === 404) return "This file can't be read here.";
    if (err.status === 409) return "This bill already exists.";
    if (err.status === 413) return "This file is too large.";
    if (err.status >= 500) return "Couldn't create a draft from this file.";
    return "Couldn't create a draft from this file.";
  }
  return "Couldn't create a draft from this file.";
}

let pendingRowIdCounter = 0;
function allocPendingRowId(): string {
  pendingRowIdCounter += 1;
  return `bill-list-pending-${pendingRowIdCounter}`;
}

export default function BillList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const pendingFilesRef = useRef(pendingFiles);
  const processingRef = useRef(false);
  const mountedRef = useRef(true);
  const enqueueSeqRef = useRef(0);
  const startedRowIdsRef = useRef(new Set<string>());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const patchRow = useCallback((id: string, patch: Partial<Omit<PendingFile, "id" | "file">>) => {
    const next = pendingFilesRef.current.map((e) => (e.id === id ? { ...e, ...patch } : e));
    pendingFilesRef.current = next;
    setPendingFiles(next);
  }, []);

  const [nonPdfMessage, setNonPdfMessage] = useState("");
  const [duplicateNotes, setDuplicateNotes] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const statusFilter: BillStatusTab = isStatusTab(statusParam)
    ? statusParam
    : DEFAULT_STATUS_TAB;
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
  const hasActiveFilters = Boolean(search || fromDate || toDate);

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

  const resolvedItems = items.map((bill) => ({
    ...bill,
    _vendor: bill.vendor_id != null ? (vendorMap.get(bill.vendor_id) ?? "") : "",
    _project: projectMap.get((bill as any).project_id) ?? "",
    _date: bill.bill_date ?? "",
    _amount: bill.total_amount ? Number(bill.total_amount) : 0,
  }));

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      for (;;) {
        const snapshot = pendingFilesRef.current;
        const entry = snapshot.find(
          (e) => e.status === "pending" && !startedRowIdsRef.current.has(e.id),
        );
        if (!entry) break;

        const { id, file, soloBatch, enqueueSeq } = entry;
        startedRowIdsRef.current.add(id);
        patchRow(id, { status: "uploading" });

        let billPublicId: string | undefined;
        let existing = false;
        let existingReason: BillDraftFromAttachmentResponse["existing_reason"] = null;

        try {
          const attachment = await uploadFile<{ public_id: string }>(
            "/api/v1/upload/attachment",
            file,
          );
          patchRow(id, { status: "reading" });
          const result = await post<BillDraftFromAttachmentResponse>(
            "/api/v1/bill/draft-from-attachment",
            { attachment_public_id: attachment.public_id },
          );
          billPublicId = result.bill_public_id;
          existing = result.existing;
          existingReason = result.existing_reason;
          patchRow(id, {
            status: "done",
            bill_public_id: result.bill_public_id,
            existing: result.existing,
            existing_reason: result.existing_reason,
          });
          reload();
        } catch (err) {
          patchRow(id, { status: "error", error: draftAttachmentErrorMessage(err) });
          continue;
        }

        const maySoloNavigate =
          soloBatch &&
          billPublicId &&
          mountedRef.current &&
          enqueueSeq === enqueueSeqRef.current;

        if (maySoloNavigate) {
          if (existing) {
            if (existingReason === "same_vendor_number_date") {
              toast("Opened the existing bill with this vendor, number and date.", "info");
            } else {
              toast("Opened the existing draft for this PDF.", "info");
            }
          }
          navigate(`/bill/${billPublicId}/edit`);
        }
      }
    } finally {
      processingRef.current = false;
      if (pendingFilesRef.current.some((e) => e.status === "pending")) {
        void processQueue();
      }
    }
  }, [navigate, patchRow, reload, toast]);

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const soloBatch = list.filter(isPdfFile).length === 1;
      let sawNonPdf = false;
      const pdfs: File[] = [];
      const skippedDuplicates: string[] = [];
      for (const file of list) {
        if (!isPdfFile(file)) {
          sawNonPdf = true;
          continue;
        }
        pdfs.push(file);
      }
      if (sawNonPdf) setNonPdfMessage(NON_PDF_MESSAGE);
      else if (pdfs.length > 0) setNonPdfMessage("");

      if (pdfs.length === 0) return;

      const newEntries: PendingFile[] = [];
      for (const file of pdfs) {
        const alreadyAdded = pendingFilesRef.current.some(
          (p) => p.file.name === file.name && p.file.size === file.size && p.status !== "error",
        );
        if (alreadyAdded) {
          skippedDuplicates.push(file.name);
          continue;
        }
        newEntries.push({
          id: allocPendingRowId(),
          file,
          status: "pending",
          soloBatch,
          enqueueSeq: 0,
        });
      }
      if (skippedDuplicates.length > 0) {
        setDuplicateNotes(skippedDuplicates.map((name) => `Already added: ${name}`));
      } else if (newEntries.length > 0) {
        setDuplicateNotes([]);
      }
      if (newEntries.length === 0) return;

      enqueueSeqRef.current += 1;
      const enqueueSeq = enqueueSeqRef.current;
      for (const entry of newEntries) {
        entry.enqueueSeq = enqueueSeq;
      }

      const next = [...pendingFilesRef.current, ...newEntries];
      pendingFilesRef.current = next;
      setPendingFiles(next);
      void processQueue();
    },
    [processQueue],
  );

  const removeFile = (id: string) => {
    const next = pendingFilesRef.current.filter((e) => e.id !== id);
    pendingFilesRef.current = next;
    setPendingFiles(next);
  };

  const clearAllFiles = () => {
    setPendingFiles([]);
    pendingFilesRef.current = [];
    startedRowIdsRef.current.clear();
    setDuplicateNotes([]);
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
      enqueueFiles(e.dataTransfer.files);
    }
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      enqueueFiles(e.target.files);
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

      <div
        className={`drop-zone ${dragOver ? "drop-zone-active" : ""}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="drop-zone-icon">📁</span>
        <p className="drop-zone-text">Drag & drop bill PDFs here</p>
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
        {nonPdfMessage && <p className="field-error">{nonPdfMessage}</p>}
        {duplicateNotes.map((note, i) => (
          <p key={`${note}-${i}`} className="field-error">
            {note}
          </p>
        ))}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
      </div>

      {pendingFiles.length > 0 && (
        <div className="pending-files">
          <div className="pending-files-header">
            <h3>Import queue ({pendingFiles.length})</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearAllFiles}>
              Clear All
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Size</th>
                <th>Status</th>
                <th style={{ width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingFiles.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.file.name}</td>
                  <td>{fmtSize(entry.file.size)}</td>
                  <td>{ROW_STATUS_LABELS[entry.status]}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {entry.status === "done" && entry.bill_public_id && (
                        <Link
                          to={`/bill/${entry.bill_public_id}/edit`}
                          className="btn btn-primary btn-sm"
                        >
                          Open{entry.existing ? " (existing)" : ""}
                        </Link>
                      )}
                      {(entry.status === "done" || entry.status === "error") && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => removeFile(entry.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {entry.error && <div className="field-error">{entry.error}</div>}
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
        const billPath =
          status === "draft"
            ? `/bill/${bill.public_id}/edit`
            : `/bill/${bill.public_id}`;
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
            onClick={() => navigate(billPath)}
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
