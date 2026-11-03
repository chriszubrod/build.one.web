import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { useFileProcessingQueue } from "../../hooks/useFileProcessingQueue";
import { returnToState, useListLocation } from "../../hooks/useReturnTo";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import Pagination from "../../components/Pagination";
import PageHeader from "../../components/PageHeader";
import ListFilterBar from "../../components/ListFilterBar";
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
import PdfDropZone from "../../components/PdfDropZone";
import type { AttachmentUploadResponse } from "../../hooks/useAttachmentRead";

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

/** Min interval between list refetches while a multi-file import batch is still running. */
const IMPORT_RELOAD_THROTTLE_MS = 5000;

function importQueueInFlight(rows: PendingFile[]): boolean {
  return rows.some(
    (e) => e.status === "pending" || e.status === "uploading" || e.status === "reading",
  );
}

const ROW_STATUS_LABELS: Record<PendingRowStatus, string> = {
  pending: "Queued",
  uploading: "Uploading…",
  reading: "Reading…",
  done: "Done",
  error: "Error",
};

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
  const mountedRef = useRef(true);
  const enqueueSeqRef = useRef(0);
  const lastImportReloadAtRef = useRef(0);
  const importReloadOwedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // U-753: the list location (tab, dates, search) a record is opened from, so
  // Save / Cancel / Complete on the record come back here. A ref too, because
  // the solo-drop navigate fires from the queue loop after an await.
  const listLocation = useListLocation("/bill/list");
  const listLocationRef = useRef(listLocation);
  useLayoutEffect(() => {
    listLocationRef.current = listLocation;
  }, [listLocation]);

  const processBillRow = async (
    entry: PendingFile,
    patch: (patch: Partial<PendingFile>) => void,
  ) => {
    const { file, soloBatch, enqueueSeq } = entry;
    patch({ status: "uploading" });

    let billPublicId: string | undefined;
    let existing = false;
    let existingReason: BillDraftFromAttachmentResponse["existing_reason"] = null;

    try {
      const attachment = await uploadFile<AttachmentUploadResponse>(
        "/api/v1/upload/attachment",
        file,
      );
      patch({ status: "reading" });
      const result = await post<BillDraftFromAttachmentResponse>(
        "/api/v1/bill/draft-from-attachment",
        { attachment_public_id: attachment.public_id },
      );
      billPublicId = result.bill_public_id;
      existing = result.existing;
      existingReason = result.existing_reason;
      patch({
        status: "done",
        bill_public_id: result.bill_public_id,
        existing: result.existing,
        existing_reason: result.existing_reason,
      });
      scheduleImportReload();
    } catch (err) {
      patch({ status: "error", error: draftAttachmentErrorMessage(err) });
      return;
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
      navigate(`/bill/${billPublicId}/edit`, { state: returnToState(listLocationRef.current) });
    }
  };

  const queue = useFileProcessingQueue<PendingFile>({
    isPending: (e) => e.status === "pending",
    process: processBillRow,
    onSettled: () => flushOwedImportReload(),
    // A step that escaped its own try/catch must not leave the row "Uploading…".
    // Only while still in flight: a throw after "done" (toast/navigate) keeps the
    // finished row and its Open link.
    onError: (entry, err, patch) => {
      if (importQueueInFlight([entry])) {
        patch({ status: "error", error: draftAttachmentErrorMessage(err) });
      }
    },
  });
  const { rows: pendingFiles, rowsRef: pendingFilesRef, enqueue: enqueueRows } = queue;

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
    loading, refreshing, error, setPage, setSearch, search, reload,
  } = usePaginatedList<Bill>(`/api/v1/get/bills${extraParams}`, 50, {
    staleWhileRevalidate: true,
    sessionPersistenceKey: "buildOne.billList",
  });
  // Search is debounced inside ListFilterBar (U-752); `search` here is the
  // committed term the list is fetched with.
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

  const flushOwedImportReload = useCallback(() => {
    if (!importReloadOwedRef.current) return;
    if (importQueueInFlight(pendingFilesRef.current)) return;
    reload();
    lastImportReloadAtRef.current = Date.now();
    importReloadOwedRef.current = false;
  }, [reload, pendingFilesRef]);

  const scheduleImportReload = useCallback(() => {
    const inFlight = importQueueInFlight(pendingFilesRef.current);
    const now = Date.now();
    if (!inFlight || now - lastImportReloadAtRef.current >= IMPORT_RELOAD_THROTTLE_MS) {
      reload();
      lastImportReloadAtRef.current = now;
      importReloadOwedRef.current = false;
    } else {
      importReloadOwedRef.current = true;
    }
  }, [reload, pendingFilesRef]);

  const enqueueFiles = useCallback(
    (files: File[]) => {
      const pdfs = files;
      if (pdfs.length === 0) return;
      const soloBatch = pdfs.length === 1;
      const skippedDuplicates: string[] = [];

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

      const queueWasIdle = !importQueueInFlight(pendingFilesRef.current);
      enqueueSeqRef.current += 1;
      if (queueWasIdle) {
        lastImportReloadAtRef.current = Date.now();
      }
      const enqueueSeq = enqueueSeqRef.current;
      for (const entry of newEntries) {
        entry.enqueueSeq = enqueueSeq;
      }

      enqueueRows(newEntries);
    },
    [pendingFilesRef, enqueueRows],
  );

  const removeFile = queue.remove;

  const clearAllFiles = () => {
    queue.clear();
    setDuplicateNotes([]);
  };

  if (loading && items.length === 0 && page === 1 && !search) {
    return <div className="page-loading">Loading...</div>;
  }
  if (error && items.length === 0) {
    return <div className="page-error">{error}</div>;
  }

  return (
    <div className="page">
      <PageHeader title="Bills" count={total} createPath="/bill/create">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => reload()}
          disabled={loading || refreshing}
          title="Fetch the latest bills from the server"
        >
          Refresh
        </button>
      </PageHeader>

      {error && items.length > 0 && (
        <div className="page-error" role="alert">
          {error}
        </div>
      )}

      <PdfDropZone
        icon="📁"
        text="Drag & drop bill PDFs here"
        multiple
        onSelect={(accepted, rejected) => {
          if (rejected.length) setNonPdfMessage(NON_PDF_MESSAGE);
          else if (accepted.length) setNonPdfMessage("");
          if (accepted.length) enqueueFiles(accepted);
        }}
      >
        {nonPdfMessage && <p className="field-error">{nonPdfMessage}</p>}
        {duplicateNotes.map((note, i) => (
          <p key={`${note}-${i}`} className="field-error">
            {note}
          </p>
        ))}
      </PdfDropZone>

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
                          state={returnToState(listLocation)}
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

      <ListFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Vendor, bill number, memo…"
        searchAriaLabel="Search bills by vendor, bill number or memo"
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={(v) => { setParam("from", v); setPage(1); }}
        onToDateChange={(v) => { setParam("to", v); setPage(1); }}
        dateAriaLabelPrefix="Bill date"
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      />

      <div className="section-label-prose list-meta">
        <span>{SECTION_LABEL[statusFilter]}</span>
        {refreshing && (
          <span className="list-count" aria-live="polite">
            Refreshing…
          </span>
        )}
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

      {!loading && !refreshing && resolvedItems.length === 0 && (
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
            to={billPath}
            linkState={returnToState(listLocation)}
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
