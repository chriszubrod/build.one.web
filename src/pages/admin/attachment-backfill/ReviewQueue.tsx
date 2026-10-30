import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../api/client";
import { useToast } from "../../../components/Toast";
import type {
  AttachmentBackfillCandidate,
  AttachmentBackfillCandidateDetail,
  AttachmentBackfillRejectReason,
  AttachmentBackfillReviewResult,
  AttachmentBackfillReviewStatus,
} from "../../../types/api";
import {
  type CandidatePdf,
  fetchCandidatePdf,
  getCandidate,
  getQueue,
  reviewCandidate,
  undoCandidate,
} from "./attachmentBackfillApi";
import {
  type BatchSelection,
  REJECT_REASONS,
  approveBlockedReason,
  isTypingTarget,
  refusalMessage,
} from "./backfillModel";
import CandidateEvidence from "./CandidateEvidence";

/** `navigator.pdfViewerEnabled === false`: the browser downloads PDFs instead of showing them. */
function pdfViewerOff(): boolean {
  return typeof navigator !== "undefined" && (navigator as { pdfViewerEnabled?: boolean }).pdfViewerEnabled === false;
}

/** Load the next keyset page when the cursor gets this close to the end. */
const PAGE_AHEAD = 2;

interface CacheEntry {
  detail?: Promise<AttachmentBackfillCandidateDetail>;
  /** The local-decision sequence number when `detail` was requested (fix C2). */
  detailSeq?: number;
  pdf?: Promise<CandidatePdf>;
}

type Loaded<T> = { id: string; value?: T; error?: string };

function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.errorCode ?? `HTTP ${err.status}`;
  return err instanceof Error ? err.message : "error";
}

function mergeResult(
  row: AttachmentBackfillCandidate,
  r: AttachmentBackfillReviewResult,
): AttachmentBackfillCandidate {
  return {
    ...row,
    row_version: r.row_version,
    review_status: r.review_status,
    reject_reason: r.reject_reason,
    reviewed_by_user_public_id: r.reviewed_by_user_public_id,
    reviewed_datetime: r.reviewed_datetime,
  };
}

/**
 * One batch (run + group + project + year + status), one candidate at a time.
 *
 * Safety rules (U-535b: the owner approves every link himself):
 * - exactly one request per action; while one is in flight every further
 *   action is ignored (busyRef is checked synchronously, before any await);
 * - every review/undo sends the row's current row_version;
 * - a 409 stale/not_pending reloads the candidate and is NEVER retried;
 * - Approve is unavailable until the detail and the PDF have loaded, and while
 *   the file has changed in Box or the bill is gone.
 */
export default function ReviewQueue({
  runPublicId,
  selection,
  reviewStatus,
  batchTotal,
  onDecided,
}: {
  runPublicId: string;
  selection: BatchSelection;
  reviewStatus: AttachmentBackfillReviewStatus | "all";
  batchTotal: number;
  onDecided?: () => void;
}) {
  const { toast } = useToast();
  // The progress denominator is fixed when the batch opens (the picker counts stay live).
  const [frozenTotal] = useState(batchTotal);
  const [rows, setRows] = useState<AttachmentBackfillCandidate[]>([]);
  const [nextAfter, setNextAfter] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [detail, setDetail] = useState<Loaded<AttachmentBackfillCandidateDetail> | null>(null);
  const [pdf, setPdf] = useState<Loaded<CandidatePdf> | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // candidate PublicId -> the decision made in this session (undo removes it).
  const [decisions, setDecisions] = useState<Record<string, "approved" | "rejected">>({});

  const busyRef = useRef(false);
  // Fix L1: the guard is released only after the commit that follows a request,
  // so a keypress landing between the response and the re-render (old closure,
  // old row, old row_version) is dropped instead of re-sent.
  const releasePendingRef = useRef(false);
  const [, setCommitTick] = useState(0);
  // Fix C2: every local review/undo result gets a sequence number; a detail
  // requested BEFORE that number has the local decision laid over it.
  const decisionSeqRef = useRef(0);
  const localResultsRef = useRef(new Map<string, { seq: number; result: AttachmentBackfillReviewResult }>());
  // Fix 6: the object URL whose iframe has fired `load` (navigation finished —
  // not proof of paint) — Approve waits for it.
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const pageLoadingRef = useRef(false);
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const row: AttachmentBackfillCandidate | undefined = rows[index];
  const rowId = row?.public_id;

  // ── queue paging ──────────────────────────────────────────────────────
  const loadPage = useCallback(
    async (after: string | null) => {
      if (pageLoadingRef.current) return;
      pageLoadingRef.current = true;
      setQueueLoading(true);
      try {
        const page = await getQueue(runPublicId, {
          group: selection.group,
          projectPublicId: selection.projectPublicId,
          year: selection.year,
          reviewStatus,
          after,
        });
        if (!mountedRef.current) return;
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.public_id));
          return [...prev, ...page.data.filter((r) => !seen.has(r.public_id))];
        });
        setNextAfter(page.next_after);
        setQueueError(null);
      } catch (err) {
        if (mountedRef.current) setQueueError(errorText(err));
      } finally {
        pageLoadingRef.current = false;
        if (mountedRef.current) setQueueLoading(false);
      }
    },
    [runPublicId, selection.group, selection.projectPublicId, selection.year, reviewStatus],
  );

  useEffect(() => {
    void loadPage(null);
  }, [loadPage]);

  // Auto-paging stops after a failed load (fix C1): only the visible Retry resumes it.
  useEffect(() => {
    if (nextAfter && !queueLoading && !queueError && index >= rows.length - PAGE_AHEAD) void loadPage(nextAfter);
  }, [index, rows.length, nextAfter, queueLoading, queueError, loadPage]);

  const retryQueue = () => {
    setQueueError(null);
    void loadPage(rows.length === 0 ? null : nextAfter);
  };

  /** The detail as it stands after any local decision made since it was requested. */
  const reconcile = (
    id: string,
    d: AttachmentBackfillCandidateDetail,
    requestedAtSeq: number,
  ): AttachmentBackfillCandidateDetail => {
    const local = localResultsRef.current.get(id);
    if (!local || local.seq <= requestedAtSeq) return d;
    return { ...d, ...mergeResult(d, local.result) };
  };

  // ── detail + PDF (current, plus ONE ahead) ─────────────────────────────
  const entryFor = useCallback((id: string): CacheEntry => {
    const cache = cacheRef.current;
    let entry = cache.get(id);
    if (!entry) {
      entry = {};
      cache.set(id, entry);
    }
    if (!entry.detail) {
      const p = getCandidate(id);
      entry.detail = p;
      entry.detailSeq = decisionSeqRef.current;
      p.catch(() => {
        if (cache.get(id)?.detail === p) delete cache.get(id)!.detail;
      });
    }
    if (!entry.pdf) {
      const p = fetchCandidatePdf(id);
      entry.pdf = p;
      p.catch(() => {
        if (cache.get(id)?.pdf === p) delete cache.get(id)!.pdf;
      });
    }
    return entry;
  }, []);

  const nextId = rows[index + 1]?.public_id;

  useEffect(() => {
    if (!rowId) {
      setDetail(null);
      setPdf(null);
      return;
    }
    // Keep only the current and the next candidate cached.
    for (const key of [...cacheRef.current.keys()]) {
      if (key !== rowId && key !== nextId) cacheRef.current.delete(key);
    }
    const entry = entryFor(rowId);
    const requestedAtSeq = entry.detailSeq ?? 0;
    setDetail({ id: rowId });
    setPdf({ id: rowId });
    let alive = true;
    entry.detail!.then(
      (fetched) => {
        if (!alive) return;
        const value = reconcile(rowId, fetched, requestedAtSeq);
        setDetail({ id: rowId, value });
        // The detail is the freshest copy of the row (row_version included).
        setRows((prev) =>
          prev.map((r) => (r.public_id === rowId ? { ...r, ...stripDetail(value) } : r)),
        );
      },
      (err) => alive && setDetail({ id: rowId, error: errorText(err) }),
    );
    entry.pdf!.then(
      (value) => alive && setPdf({ id: rowId, value }),
      (err) => alive && setPdf({ id: rowId, error: errorText(err) }),
    );
    return () => {
      alive = false;
    };
    // nextId deliberately excluded: a newly loaded page must not reload the current candidate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId, entryFor]);

  // Background prefetch of the next candidate, once the current one has its detail.
  const currentDetailReady = detail?.id === rowId && !!detail?.value;
  useEffect(() => {
    if (nextId && currentDetailReady) entryFor(nextId);
  }, [nextId, currentDetailReady, entryFor]);

  // Object URL for the displayed PDF only; revoked when the candidate changes or on unmount.
  const pdfBlob = pdf?.id === rowId ? pdf?.value?.blob : undefined;
  useEffect(() => {
    if (!pdfBlob) {
      setPdfUrl(null);
      return;
    }
    const url = URL.createObjectURL(pdfBlob);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfBlob]);

  // ── actions ───────────────────────────────────────────────────────────
  const currentDetail = detail?.id === rowId ? detail?.value : undefined;
  const currentPdf = pdf?.id === rowId ? pdf?.value : undefined;
  // Bytes arriving is not enough: the CURRENT object URL's iframe must have loaded.
  const pdfLoadedInFrame = !!currentPdf && !!pdfUrl && loadedUrl === pdfUrl;
  const viewerOff = pdfViewerOff();
  const blocked = row
    ? approveBlockedReason({
        row,
        detail: currentDetail,
        pdfLoaded: pdfLoadedInFrame,
        pdfMatches: currentPdf?.matches,
        viewerOff,
      })
    : "No candidate";
  const canReject = !!row && row.review_status === "pending" && !row.linked;
  const canUndo =
    !!row && (row.review_status === "approved" || row.review_status === "rejected") && !row.linked;

  const applyResult = (id: string, result: AttachmentBackfillReviewResult) => {
    decisionSeqRef.current += 1;
    localResultsRef.current.set(id, { seq: decisionSeqRef.current, result });
    setRows((prev) => prev.map((r) => (r.public_id === id ? mergeResult(r, result) : r)));
    // The detail on screen gets the same decision, so the gates read it at once.
    setDetail((d) => (d?.id === id && d.value ? { id, value: { ...d.value, ...mergeResult(d.value, result) } } : d));
  };

  const reloadCandidate = async (id: string) => {
    const prevPdf = cacheRef.current.get(id)?.pdf;
    cacheRef.current.delete(id);
    const requestedAtSeq = decisionSeqRef.current;
    try {
      const fresh = reconcile(id, await getCandidate(id), requestedAtSeq);
      if (!mountedRef.current) return;
      cacheRef.current.set(id, { detail: Promise.resolve(fresh), detailSeq: decisionSeqRef.current, pdf: prevPdf });
      setRows((prev) => prev.map((r) => (r.public_id === id ? { ...r, ...stripDetail(fresh) } : r)));
      setDetail((d) => (d?.id === id ? { id, value: fresh } : d));
    } catch (err) {
      if (mountedRef.current) setDetail((d) => (d?.id === id ? { id, error: errorText(err) } : d));
    }
  };

  const say = (message: string, type: "success" | "error" | "info" = "info") => {
    setNotice(message);
    toast(message, type);
  };

  // Any 409 is server state we did not have: reload so the gates reflect it (fix L3). Never retry.
  const handleRefusal = async (id: string, err: unknown) => {
    if (err instanceof ApiError && err.status === 409) {
      await reloadCandidate(id);
      const code = err.errorCode;
      say(
        code === "stale" || code === "not_pending" ? "Changed elsewhere — reloaded" : refusalMessage(code),
        code === "stale" || code === "not_pending" ? "info" : "error",
      );
      return;
    }
    if (err instanceof ApiError && err.errorCode) {
      say(refusalMessage(err.errorCode), "error");
      return;
    }
    say(err instanceof Error ? err.message : "Request failed", "error");
  };

  /** Runs `fn` as the single in-flight request; a second call while one runs is dropped. */
  const runExclusive = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      if (mountedRef.current) {
        // Released by the effect below, after this update has committed (fix L1).
        releasePendingRef.current = true;
        setBusy(false);
        setCommitTick((t) => t + 1);
      } else {
        busyRef.current = false;
      }
    }
  };

  useEffect(() => {
    if (releasePendingRef.current) {
      releasePendingRef.current = false;
      busyRef.current = false;
    }
  });

  const decide = (decision: "approved" | "rejected", reason?: AttachmentBackfillRejectReason) =>
    runExclusive(async () => {
      if (!row || !row.row_version) return;
      if (decision === "approved" && blocked) return;
      if (decision === "rejected" && (!canReject || !reason)) return;
      const id = row.public_id;
      setNotice(null);
      try {
        const result = await reviewCandidate(
          id,
          decision === "approved"
            ? { decision: "approved", row_version: row.row_version }
            : { decision: "rejected", reject_reason: reason!, row_version: row.row_version },
        );
        if (!mountedRef.current) return;
        applyResult(id, result);
        setDecisions((prev) => ({ ...prev, [id]: decision }));
        setRejectOpen(false);
        setIndex((i) => Math.min(i + 1, rows.length));
        onDecided?.();
      } catch (err) {
        setRejectOpen(false);
        await handleRefusal(id, err);
      }
    });

  const undo = () =>
    runExclusive(async () => {
      if (!row || !row.row_version || !canUndo) return;
      const id = row.public_id;
      setNotice(null);
      try {
        const result = await undoCandidate(id, row.row_version);
        if (!mountedRef.current) return;
        applyResult(id, result);
        setDecisions((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        say("Decision undone", "info");
        onDecided?.();
      } catch (err) {
        await handleRefusal(id, err);
      }
    });

  const move = (delta: number) => {
    if (busyRef.current) return;
    setRejectOpen(false);
    setNotice(null);
    setIndex((i) => Math.max(0, Math.min(i + delta, rows.length)));
  };

  // ── keyboard ──────────────────────────────────────────────────────────
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (isTypingTarget(e.target)) return;
    const key = e.key.toLowerCase();
    if (rejectOpen) {
      if (key === "escape") {
        e.preventDefault();
        setRejectOpen(false);
        return;
      }
      const n = Number(key);
      if (Number.isInteger(n) && n >= 1 && n <= REJECT_REASONS.length) {
        e.preventDefault();
        void decide("rejected", REJECT_REASONS[n - 1].value);
      }
      return;
    }
    switch (key) {
      case "a":
        e.preventDefault();
        void decide("approved");
        break;
      case "r":
        if (canReject && !busyRef.current) {
          e.preventDefault();
          setRejectOpen(true);
        }
        break;
      case "u":
        e.preventDefault();
        void undo();
        break;
      case "j":
        e.preventDefault();
        move(1);
        break;
      case "k":
        e.preventDefault();
        move(-1);
        break;
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── render ────────────────────────────────────────────────────────────
  const approvedCount = Object.values(decisions).filter((d) => d === "approved").length;
  const rejectedCount = Object.values(decisions).filter((d) => d === "rejected").length;
  const total = Math.max(frozenTotal, rows.length);

  const progress = (
    <div className="abf-progress" data-testid="abf-progress">
      <span>
        {row ? `${index + 1} of ${total} in this batch` : `${total} in this batch`}
      </span>
      <span>
        Approved this session: {approvedCount} · Rejected this session: {rejectedCount}
      </span>
    </div>
  );

  const queueErrorBanner = queueError ? (
    <div className="page-error abf-queue-error" role="alert" data-testid="abf-queue-error">
      Could not load the queue ({queueError}).{" "}
      <button type="button" className="btn" onClick={retryQueue}>
        Retry
      </button>
    </div>
  ) : null;

  if (queueError && rows.length === 0) return queueErrorBanner;
  if (rows.length === 0) {
    return queueLoading ? (
      <div className="page-loading">Loading…</div>
    ) : (
      <p className="text-muted" data-testid="abf-empty">
        Nothing in this batch.
      </p>
    );
  }
  if (!row) {
    return (
      <div className="abf-review">
        {progress}
        {queueErrorBanner}
        <p className="text-muted" data-testid="abf-end">
          {queueLoading ? "Loading more…" : "End of this batch. Press K to go back."}
        </p>
      </div>
    );
  }

  return (
    <div className="abf-review">
      {progress}
      {queueErrorBanner}
      {notice && (
        <div className="abf-notice" role="status" data-testid="abf-status">
          {notice}
        </div>
      )}
      <div className="abf-main">
        <div className="abf-doc">
          {/* Viewer off: no iframe at all — in download mode every candidate would download a file. */}
          {viewerOff ? (
            <div className="abf-notice abf-notice-strong" role="alert" data-testid="abf-pdf-viewer-off">
              This browser is set to download PDFs instead of showing them — turn on the built-in PDF viewer to
              review.
            </div>
          ) : pdfUrl ? (
            <iframe
              key={pdfUrl}
              className="abf-iframe"
              title="Source document"
              src={pdfUrl}
              data-testid="abf-iframe"
              onLoad={() => setLoadedUrl(pdfUrl)}
            />
          ) : pdf?.error ? (
            <div className="abf-doc-placeholder">Document unavailable ({pdf.error})</div>
          ) : (
            <div className="abf-doc-placeholder">Loading document…</div>
          )}
        </div>
        <div className="abf-side">
          <div className="abf-status-line">
            Status: {row.review_status ?? "—"}
            {row.reject_reason ? ` (${row.reject_reason})` : ""}
          </div>
          <div className="abf-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void decide("approved")}
              disabled={busy || !!blocked}
              title={blocked ?? undefined}
              data-testid="abf-approve"
            >
              Approve (A)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setRejectOpen(true)}
              disabled={busy || !canReject}
              data-testid="abf-reject"
            >
              Reject (R)
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void undo()}
              disabled={busy || !canUndo}
              data-testid="abf-undo"
            >
              Undo (U)
            </button>
            <button type="button" className="btn" onClick={() => move(-1)} disabled={busy || index === 0}>
              Previous (K)
            </button>
            <button type="button" className="btn" onClick={() => move(1)} disabled={busy}>
              Next (J)
            </button>
          </div>
          {rejectOpen && (
            <div className="abf-reasons" role="group" aria-label="Reject reason" data-testid="abf-reasons">
              <div className="abf-muted">Reason (1–6, Esc cancels)</div>
              {REJECT_REASONS.map((r, i) => (
                <button
                  key={r.value}
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void decide("rejected", r.value)}
                  data-reason={r.value}
                >
                  {i + 1}. {r.label}
                </button>
              ))}
              <button type="button" className="btn" onClick={() => setRejectOpen(false)}>
                Cancel (Esc)
              </button>
            </div>
          )}
          <CandidateEvidence
            row={row}
            detail={currentDetail}
            detailError={detail?.id === rowId ? detail?.error ?? null : null}
            pdfMatches={currentPdf?.matches}
            pdfCheckUnknown={!!currentPdf && currentPdf.matches === null}
          />
        </div>
      </div>
    </div>
  );
}

/** The candidate columns of a detail (snippets and the content check are per-view, not row state). */
function stripDetail(d: AttachmentBackfillCandidateDetail): AttachmentBackfillCandidate {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { snippets, snippet_error, content_matches_check, ...rowFields } = d;
  return rowFields;
}
