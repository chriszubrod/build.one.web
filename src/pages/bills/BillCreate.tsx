import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { post, put, uploadFile } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import { computeBillLine, sumLineAmounts } from "./lineMath";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import Breadcrumb, { entityCrumbs } from "../../components/Breadcrumb";
import type { Bill } from "../../types/api";
import { hasBillPermission } from "./billPermissions";
import {
  acceptPrefilled,
  applyUserLinePatch,
  codingSuggestAmountFromLines,
  formatSuggestionBadgeLabel,
  UNREVIEWED_PREFILL_MSG,
  lineShowsProjectSuggestionMarker,
  linesHaveUnreviewedPrefill,
  lineShowsSuggestionBadgeFor,
  projectHintFromLines,
  suggestionBadgeClassName,
  type LineCodingFields,
} from "./codingSuggestion";
import { useBillCodingSuggestion } from "./useBillCodingSuggestion";
import {
  acceptAllHeaderPrefill,
  acceptAllLine1Prefill,
  acceptHeaderPrefillField,
  acceptLine1PrefillField,
  createEmptyHeaderPrefill,
  createEmptyLine1Prefill,
  HEADER_PREFILL_BADGE_LABEL,
  headersHaveUnreviewedPrefill,
  line1HasUnreviewedPrefill,
  markHeaderUserEdit,
  markLine1PrefillUserEdit,
  revertUnacceptedHeaderPrefill,
  revertUnacceptedLine1Prefill,
  type HeaderPrefillField,
  type HeaderPrefillMeta,
  type HeaderUserTouched,
  type Line1PrefillField,
  type Line1PrefillMeta,
} from "./headerPrefill";
import {
  applyReadAttachmentResult,
  GENERIC_READ_ERROR,
  pullBillPdfFromLocationState,
  readBillAttachment,
  revertUnacceptedCodingPrefill,
  revertUnacceptedLine1Scalars,
} from "./readAttachment";
import { composeBillMemo } from "./billMemo";

interface AttachmentResponse {
  public_id: string;
  content_type: string | null;
}

// Local shape for the line items entered alongside the bill header. Same
// field names as BillEdit's LineItemRow so the compute helpers + downstream
// POST payload line up.
interface LineItemDraft extends LineCodingFields {
  uid: string;
  description: string;
  quantity: string;
  rate: string;
  amount: string;
  markup: string;
  price: string;
  is_billable: boolean;
}

// Every row carries a client-minted `uid` so the rendered rows can be keyed on
// identity rather than array index — removing a non-last row otherwise makes
// React reuse a DOM node across two logically-different lines, landing focus
// and in-progress input on the wrong one. Same convention as BillEdit's
// newLineItem(). The uid is render-local: it is never sent to the API.
let nextLineUid = 0;
const newLine = (): LineItemDraft => ({
  uid: `li-uid-${++nextLineUid}`,
  project_public_id: "",
  sub_cost_code_id: "",
  description: "",
  quantity: "1",
  rate: "",
  amount: "",
  markup: "",
  price: "",
  is_billable: true,
});

function fmtMoney(v: string): string {
  if (!v) return "$0.00";
  const n = Number(v);
  if (isNaN(n)) return v;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const UPLOAD_PDF_ERROR = "Could not upload this PDF";

function filePrefillAdornment(
  ariaLabel: string,
  onAccept: () => void,
  busy: boolean,
  compact = false,
): ReactNode {
  return (
    <div
      className={`coding-suggestion-actions header-prefill-adornment${compact ? " coding-suggestion-actions-compact" : ""}`}
    >
      <span className={`status-badge coding-suggested${compact ? " status-badge-compact" : ""}`}>
        {HEADER_PREFILL_BADGE_LABEL}
      </span>
      <button
        type="button"
        className="btn-coding-accept"
        title="Accept value from file"
        aria-label={ariaLabel}
        disabled={busy}
        onClick={onAccept}
      >
        ✓
      </button>
    </div>
  );
}

/** "From file" badge + ✓ for a header or line-1 field still awaiting acceptance. */
function prefillAdornment<F extends string>(
  meta: { [K in F]?: { state?: string } },
  field: F,
  labelPrefix: string,
  onAccept: (field: F) => void,
  busy: boolean,
  compact = false,
): ReactNode {
  if (meta[field]?.state !== "prefilled") return null;
  return filePrefillAdornment(
    `Accept ${labelPrefix}${field} from file`,
    () => onAccept(field),
    busy,
    compact,
  );
}

function lineItemBadgeSlot(content: ReactNode): ReactNode {
  return <div className="line-item-badge-slot">{content}</div>;
}

function lineItemCell(
  control: ReactNode,
  badge: ReactNode,
  opts?: { align?: "right" | "center"; computed?: boolean },
): ReactNode {
  const alignClass =
    opts?.align === "right"
      ? " line-item-cell-align-right"
      : opts?.align === "center"
        ? " line-item-cell-align-center"
        : "";
  const computedClass = opts?.computed ? " line-item-cell-computed" : "";
  return (
    <td className={`line-item-cell${alignClass}${computedClass}`}>
      <div className="line-item-control">{control}</div>
      {lineItemBadgeSlot(badge)}
    </td>
  );
}

function enteredByDisplayName(
  me: ReturnType<typeof useCurrentUser>["data"],
): string {
  const u = me?.user;
  const name = [u?.firstname ?? "", u?.lastname ?? ""].join(" ").trim();
  if (name !== "") return name;
  return me?.auth.username ?? "";
}

export default function BillCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: lookups, loading: lookupsLoading } = useLookups(
    "vendors,payment_terms,sub_cost_codes,projects",
  );
  const { data: me } = useCurrentUser();
  const meRef = useRef(me);
  meRef.current = me;
  const { toast } = useToast();
  // Complete bypasses Review entirely — straight to IsDraft=False + outbox
  // (SharePoint, Excel, QBO). The API gates it on Modules.BILLS.can_complete;
  // we mirror that here so the button only shows when it would actually work.
  // System admins bypass the module check on the server side; bypass here too.
  const canCompleteBills = hasBillPermission(me, "can_complete");
  const [form, setForm] = useState({
    vendor_public_id: "",
    payment_term_public_id: "",
    bill_date: "",
    bill_number: "",
    memo: "",
  });
  // Multiple line items. Start with one empty row; user can + Add / × Remove.
  // Empty rows (no user-entered fields — see isLinePopulated) are silently
  // dropped at submit time, matching the "hasLineData" behavior used before
  // multi-line support landed.
  const [lines, setLines] = useState<LineItemDraft[]>(() => [newLine()]);
  const [file, setFile] = useState<File | null>(null);
  const [attachmentPublicId, setAttachmentPublicId] = useState<string | null>(null);
  const [readingAttachment, setReadingAttachment] = useState(false);
  const [readInlineMessage, setReadInlineMessage] = useState<string | null>(null);
  const [headerPrefill, setHeaderPrefill] = useState<HeaderPrefillMeta>(() =>
    createEmptyHeaderPrefill(),
  );
  const [headerUserTouched, setHeaderUserTouched] = useState<HeaderUserTouched>({});
  const [line1Prefill, setLine1Prefill] = useState<Line1PrefillMeta>(() =>
    createEmptyLine1Prefill(),
  );
  /** Line row uid that owns line1Prefill badges/gates (not index 0 after row removal). */
  const [line1PrefillUid, setLine1PrefillUid] = useState<string | null>(null);
  const readAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const readGenerationRef = useRef(0);
  const navPdfStartedRef = useRef(false);
  const pendingReadApplyRef = useRef<{
    result: Awaited<ReturnType<typeof readBillAttachment>>;
    generation: number;
  } | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const headerPrefillRef = useRef(headerPrefill);
  headerPrefillRef.current = headerPrefill;
  const headerUserTouchedRef = useRef(headerUserTouched);
  headerUserTouchedRef.current = headerUserTouched;
  const line1PrefillRef = useRef(line1Prefill);
  line1PrefillRef.current = line1Prefill;
  const line1PrefillUidRef = useRef(line1PrefillUid);
  line1PrefillUidRef.current = line1PrefillUid;
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const lookupsRef = useRef(lookups);
  lookupsRef.current = lookups;
  const lookupsLoadingRef = useRef(lookupsLoading);
  lookupsLoadingRef.current = lookupsLoading;
  // Browser blob URL for rendering the selected PDF in an iframe pre-upload.
  // Built + revoked via useEffect below so we don't leak object URLs across
  // successive selections.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Three mutually-exclusive in-flight actions collapsed into one state.
  // null = idle. The button labels + disabled gates branch off this value
  // instead of three separate booleans.
  const [busyAction, setBusyAction] = useState<"save" | "submit" | "complete" | null>(null);
  const busy = busyAction !== null || readingAttachment;
  const [saveError, setSaveError] = useState("");
  const [memoUserEdited, setMemoUserEdited] = useState(false);
  const memoUserEditedRef = useRef(false);
  memoUserEditedRef.current = memoUserEdited;
  const memoAutoActiveRef = useRef(false);
  const memoSourceRef = useRef<{
    longDescription: string | null;
    reference: string | null;
  } | null>(null);
  /** User-selected project hint for coding suggest — not updated by pre-fill. */
  const [projectHintForSuggest, setProjectHintForSuggest] = useState<string | undefined>();
  const memoForSuggest =
    memoAutoActiveRef.current && !memoUserEditedRef.current ? "" : form.memo;
  const debouncedMemo = useDebouncedValue(memoForSuggest, 400);
  const pdfAttachedRef = useRef(false);
  const codingProjectHint =
    projectHintForSuggest ?? projectHintFromLines(lines);
  const codingSuggestAmount = codingSuggestAmountFromLines(lines, codingProjectHint);
  const debouncedCodingAmount = useDebouncedValue(codingSuggestAmount ?? "", 400);
  // Which button triggered the submit? All three buttons are type="submit"
  // so HTML required-field validation runs uniformly; we just need to
  // remember which one fired the form's submit event. A ref (not state)
  // because we don't render off of it and need to read it synchronously
  // inside onSubmit.
  const pendingActionRef = useRef<"save" | "submit" | "complete" | null>(null);
  // Synchronous guard against double-submit — does not depend on React flushing
  // the buttons' disabled={busy} attribute between rapid clicks.
  const inFlightRef = useRef(false);
  // busyAction (what the buttons render off) and inFlightRef (the synchronous
  // guard) are two representations of one fact and must always be cleared
  // TOGETHER. Clearing only busyAction re-enables the buttons while the ref
  // still short-circuits every later submit — the form wedges permanently with
  // no error and no recovery short of a reload.
  const endAction = () => {
    setBusyAction(null);
    inFlightRef.current = false;
  };
  // Preselect "Due on receipt" once lookups load, unless the user has already
  // picked a term. Idempotent — the guard on `form.payment_term_public_id`
  // stops the default from re-applying after the user clears the field.
  useEffect(() => {
    if (!lookups.payment_terms || form.payment_term_public_id) return;
    const defaultTerm = lookups.payment_terms.find(
      (pt) => (pt.name || "").toLowerCase() === "due on receipt",
    );
    if (defaultTerm) {
      setForm((prev) => ({ ...prev, payment_term_public_id: defaultTerm.public_id }));
    }
  }, [lookups.payment_terms, form.payment_term_public_id]);

  const isLinePopulated = (li: LineItemDraft): boolean =>
    li.project_public_id !== "" ||
    li.sub_cost_code_id !== "" ||
    li.description !== "" ||
    li.rate !== "";

  const syncAutoMemoFromLines = () => {
    if (!memoAutoActiveRef.current || memoUserEditedRef.current) return;
    const source = memoSourceRef.current;
    if (!source) return;
    const projects = lookupsRef.current.projects ?? [];
    const sccRows = lookupsRef.current.sub_cost_codes ?? [];
    const populated = linesRef.current.filter(isLinePopulated);
    const memo = composeBillMemo({
      enteredBy: enteredByDisplayName(meRef.current),
      populatedLines: populated.map((li) => ({
        project_public_id: li.project_public_id,
        sub_cost_code_id: li.sub_cost_code_id,
        description: li.description,
      })),
      projectLabelForLine: (slice) => {
        const row = projects.find((p) => p.public_id === slice.project_public_id);
        if (!row) return null;
        const abbr = (row.abbreviation ?? "").trim();
        return abbr !== "" ? abbr : row.name;
      },
      costCodeNumberForLine: (slice) => {
        const id = Number(slice.sub_cost_code_id);
        if (!Number.isFinite(id)) return null;
        const row = sccRows.find((s) => s.id === id);
        return row?.number?.trim() ? row.number.trim() : null;
      },
      longDescription: source.longDescription,
      reference: source.reference,
    });
    setForm((prev) => (prev.memo === memo ? prev : { ...prev, memo }));
  };

  const onChange = (name: string, value: string) => {
    if (name === "memo") {
      memoUserEditedRef.current = true;
      setMemoUserEdited(true);
      memoAutoActiveRef.current = false;
    }
    if (
      name === "vendor_public_id" ||
      name === "bill_number" ||
      name === "bill_date"
    ) {
      setHeaderUserTouched((prev) => ({ ...prev, [name]: true }));
      setHeaderPrefill((prev) => markHeaderUserEdit(prev, name));
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const acceptHeaderField = (field: HeaderPrefillField) => {
    setHeaderPrefill((prev) => acceptHeaderPrefillField(prev, field));
  };

  const acceptLine1Field = (field: Line1PrefillField) => {
    setLine1Prefill((prev) => acceptLine1PrefillField(prev, field));
  };

  const lineIndexForPrefillUid = (rows: LineItemDraft[]): number => {
    const uid = line1PrefillUidRef.current;
    if (uid) {
      const idx = rows.findIndex((li) => li.uid === uid);
      if (idx >= 0) return idx;
    }
    return 0;
  };

  const updateLine = (index: number, key: keyof LineItemDraft, value: string | boolean) => {
    const prefillIndex = lineIndexForPrefillUid(linesRef.current);
    if (
      index === prefillIndex &&
      (key === "description" || key === "quantity" || key === "rate")
    ) {
      setLine1Prefill((prev) => markLine1PrefillUserEdit(prev, key));
    }
    setLines((prev) =>
      prev.map((li, i) => {
        if (i !== index) return li;
        let row = li;
        if (key === "description") row = { ...row, file_description_touched: true };
        if (key === "quantity") row = { ...row, file_quantity_touched: true };
        if (key === "rate") row = { ...row, file_rate_touched: true };
        return computeBillLine(
          applyUserLinePatch(row, { [key]: value } as Partial<LineItemDraft>),
        );
      }),
    );
  };

  const acceptLineSuggestion = (index: number) => {
    setLines((prev) => prev.map((li, i) => (i === index ? acceptPrefilled(li) : li)));
  };

  const acceptAllSuggestions = () => {
    setHeaderPrefill((prev) => acceptAllHeaderPrefill(prev));
    setLine1Prefill((prev) => acceptAllLine1Prefill(prev));
    setLines((prev) => prev.map(acceptPrefilled));
  };

  const pdfAttached = file !== null || attachmentPublicId !== null;
  pdfAttachedRef.current = pdfAttached;

  const { budgetChip } = useBillCodingSuggestion({
    enabled: !!form.vendor_public_id,
    vendor_public_id: form.vendor_public_id,
    memo: memoForSuggest,
    debouncedMemo,
    debouncedAmount: codingSuggestAmount == null ? undefined : debouncedCodingAmount,
    projectHintForSuggest,
    lines,
    sccCatalog: lookups.sub_cost_codes ?? [],
    setLines,
    pdfAttached,
    pdfAttachedRef,
  });

  useEffect(() => {
    syncAutoMemoFromLines();
  }, [lines, memoUserEdited, me, lookups.projects, lookups.sub_cost_codes]);

  const hasHeaderPrefill = headersHaveUnreviewedPrefill(headerPrefill);
  const hasLine1ScalarPrefill = line1HasUnreviewedPrefill(line1Prefill);
  // One flag drives the Accept-all button and every save gate, so they cannot drift apart.
  const hasPrefilledSuggestions =
    hasHeaderPrefill || hasLine1ScalarPrefill || linesHaveUnreviewedPrefill(lines);
  const saveBlockedTitle = hasPrefilledSuggestions ? UNREVIEWED_PREFILL_MSG : undefined;

  const addLine = () => setLines((prev) => [...prev, newLine()]);

  const removeLine = (index: number) => {
    setLines((prev) => {
      if (prev.length <= 1) return prev;
      const removed = prev[index];
      if (removed && removed.uid === line1PrefillUidRef.current) {
        setLine1Prefill(createEmptyLine1Prefill());
        setLine1PrefillUid(null);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Build (and revoke) a blob URL for the selected PDF so we can preview it
  // in an iframe before upload. Cleanup runs on file change / unmount, so a
  // second selection doesn't leak the first URL.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (!mountedRef.current) {
          readAbortRef.current?.abort();
        }
      });
    };
  }, []);

  const abortReadAttachment = () => {
    readAbortRef.current?.abort();
    readAbortRef.current = null;
  };

  const applyPendingReadResult = (generation: number) => {
    const pending = pendingReadApplyRef.current;
    if (
      !pending ||
      pending.generation !== generation ||
      generation !== readGenerationRef.current ||
      pending.result == null
    ) {
      return false;
    }
    const vendors = lookupsRef.current.vendors ?? [];
    const sccCatalog = lookupsRef.current.sub_cost_codes ?? [];
    const needsLookups =
      pending.result.status === "ok" || pending.result.status === "partial";
    if (
      needsLookups &&
      lookupsLoadingRef.current &&
      vendors.length === 0 &&
      sccCatalog.length === 0
    ) {
      return false;
    }
    pendingReadApplyRef.current = null;
    const outcome = applyReadAttachmentResult({
      result: pending.result,
      form: formRef.current,
      headerPrefill: headerPrefillRef.current,
      headerUserTouched: headerUserTouchedRef.current,
      line1Prefill: line1PrefillRef.current,
      lines: linesRef.current,
      vendors,
      sccCatalog,
    });
    setForm(outcome.form as typeof form);
    setHeaderPrefill(outcome.headerPrefill);
    setLine1Prefill(outcome.line1Prefill);
    setLines(outcome.lines);
    if (outcome.lines.length > 0) {
      setLine1PrefillUid(outcome.lines[0].uid);
    }
    if (outcome.inlineMessage) setReadInlineMessage(outcome.inlineMessage);
    if (outcome.memoSource) {
      memoSourceRef.current = outcome.memoSource;
      if (!memoUserEditedRef.current && formRef.current.memo.trim() === "") {
        memoAutoActiveRef.current = true;
        linesRef.current = outcome.lines;
        syncAutoMemoFromLines();
      }
    }
    // A result held back for lookups lands here after the read's finally already ran:
    // this is where the read ends, so clear "Reading invoice…" and the save lock.
    setReadingAttachment(false);
    return true;
  };

  useEffect(() => {
    const pending = pendingReadApplyRef.current;
    if (!pending) return;
    if (pending.generation !== readGenerationRef.current) {
      pendingReadApplyRef.current = null;
      return;
    }
    applyPendingReadResult(pending.generation);
  }, [lookups, lookupsLoading]);

  const revertFilePrefillState = () => {
    const line1MetaSnapshot = line1PrefillRef.current;
    const reverted = revertUnacceptedHeaderPrefill(
      headerPrefillRef.current,
      formRef.current,
    );
    if (!memoUserEditedRef.current) {
      reverted.form = { ...reverted.form, memo: "" };
      memoAutoActiveRef.current = false;
      memoSourceRef.current = null;
    }
    setHeaderPrefill(reverted.meta);
    setForm(reverted.form as typeof form);
    const rows = linesRef.current;
    const targetIndex = lineIndexForPrefillUid(rows);
    const targetLine = rows[targetIndex] ?? rows[0];
    setLine1Prefill(
      targetLine
        ? revertUnacceptedLine1Prefill(line1MetaSnapshot, targetLine).meta
        : createEmptyLine1Prefill(),
    );
    const revertedRow = targetLine
      ? revertUnacceptedCodingPrefill(
          revertUnacceptedLine1Scalars(targetLine, line1MetaSnapshot),
          "file",
        )
      : targetLine;
    setLines((prev) => {
      if (prev.length === 0) return prev;
      const idx = lineIndexForPrefillUid(prev);
      return prev.map((li, i) => {
        if (i === idx && revertedRow) return revertedRow;
        return revertUnacceptedCodingPrefill(li, "file");
      });
    });
  };

  const beginPdfAttachment = (f: File) => {
    const hadPriorAttachment = file !== null || attachmentPublicId !== null;
    pendingReadApplyRef.current = null;
    abortReadAttachment();
    if (hadPriorAttachment) {
      revertFilePrefillState();
    }
    setAttachmentPublicId(null);
    setReadInlineMessage(null);
    setSaveError("");
    setFile(f);

    const ac = new AbortController();
    readAbortRef.current = ac;
    const readGeneration = ++readGenerationRef.current;

    void (async () => {
      setReadingAttachment(true);
      try {
        const attachment = await uploadFile<AttachmentResponse>(
          "/api/v1/upload/attachment",
          f,
        );
        if (ac.signal.aborted) return;
        setAttachmentPublicId(attachment.public_id);

        const projectHint = projectHintFromLines(linesRef.current);
        const result = await readBillAttachment(
          attachment.public_id,
          projectHint || null,
          ac.signal,
        );
        if (ac.signal.aborted || readGenerationRef.current !== readGeneration) return;

        if (result == null) {
          setReadInlineMessage(GENERIC_READ_ERROR);
          return;
        }

        pendingReadApplyRef.current = { result, generation: readGeneration };
        applyPendingReadResult(readGeneration);
      } catch (err: unknown) {
        if (!ac.signal.aborted) {
          setReadInlineMessage(UPLOAD_PDF_ERROR);
        }
      } finally {
        if (readAbortRef.current === ac) readAbortRef.current = null;
        if (readGenerationRef.current === readGeneration) {
          const stillDeferred =
            pendingReadApplyRef.current?.generation === readGeneration;
          setReadingAttachment(stillDeferred);
        }
      }
    })();
  };

  const acceptFile = (f: File | null): boolean => {
    if (!f) return false;
    if (f.type !== "application/pdf") {
      setSaveError("Only PDF files are allowed.");
      return false;
    }
    beginPdfAttachment(f);
    return true;
  };

  const clearPdfAttachment = () => {
    pendingReadApplyRef.current = null;
    abortReadAttachment();
    revertFilePrefillState();
    setFile(null);
    setAttachmentPublicId(null);
    setReadInlineMessage(null);
    setReadingAttachment(false);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f || !acceptFile(f)) {
      clearPdfAttachment();
      e.target.value = "";
    }
  };

  useEffect(() => {
    const incoming = pullBillPdfFromLocationState(location.state);
    if (!incoming) return;
    navigate(location.pathname, { replace: true, state: {} });
    if (navPdfStartedRef.current) return;
    navPdfStartedRef.current = true;
    acceptFile(incoming);
  }, [location.pathname, location.state, navigate]);

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
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) acceptFile(dropped);
  };

  // Drop empty rows (per the (a) call). Everything downstream — buildBody,
  // the additional-line POST loop, gates, and totals — operates on this
  // filtered list. `hasLineData` is now "is any row populated?".
  const populatedLines = lines.filter(isLinePopulated);
  const hasLineData = populatedLines.length > 0;

  // Submit For Review is a compound action: POST /api/v1/create/bill
  // (Modules.BILLS.can_create) then POST /api/v1/submit/review/bill/:id
  // (can_update — same rule resolveBillEditActions encodes in
  // billPermissions.ts). Both permissions must be present. Also needs at
  // least one populated line with a project so the submit endpoint's
  // recipient resolver can find PMs/Owners (K06988 bug on empty
  // resolution). Any populated line with a project is enough — a bill can
  // legitimately span multiple projects, and the resolver walks all of them.
  const hasCreatePerm = hasBillPermission(me, "can_create");
  const hasUpdatePerm = hasBillPermission(me, "can_update");
  const hasSubmitPerms = hasCreatePerm && hasUpdatePerm;
  const hasProjectOnLine = populatedLines.some((li) => !!li.project_public_id);
  const canSubmitForReview = hasSubmitPerms && hasProjectOnLine && !hasPrefilledSuggestions;
  const submitForReviewTitle = !hasSubmitPerms
    ? "Bills create and update permissions are required — Submit for Review creates the bill and calls the review submit endpoint."
    : !hasProjectOnLine
      ? "Set Project on at least one line item to enable Submit for Review."
      : hasPrefilledSuggestions
        ? UNREVIEWED_PREFILL_MSG
        : "Save the bill AND queue the reviewer notification email.";

  // Complete needs EVERY populated line to have both project AND SCC —
  // completion enqueues one SharePoint upload per project and one Excel row
  // per SCC; missing either dead-letters that outbox row. Requires at least
  // one populated line so there's anything to complete.
  const canCompleteFromHere =
    hasLineData &&
    !hasPrefilledSuggestions &&
    populatedLines.every((li) => !!li.project_public_id && !!li.sub_cost_code_id);

  // Bill.TotalAmount = sum of all populated lines' amounts. Server writes
  // this to the header; per-line values live on the individual BLIs. Empty
  // rows contribute nothing (they're already filtered out).
  const totalAmount = sumLineAmounts(populatedLines);

  const buildBody = () => {
    // First populated line becomes the inline `line_*` summary — the
    // API's create endpoint takes ONE summary and auto-creates the
    // corresponding BillLineItem (the one the attachment links to).
    // Any additional populated lines get POSTed separately after the
    // bill is created (see handleSubmit).
    //
    // submit_for_review is ALWAYS false — never null/omitted. The auto-Submit
    // gate in BillService.create fires when submit_for_review IS NOT False
    // (entities/bill/business/service.py:479), and that hook's recipient
    // resolver only sees this summary line — before the additional-line
    // POSTs run. We submit for review explicitly AFTER all lines persist.
    const first = populatedLines[0];
    const body: Record<string, unknown> = {
      vendor_public_id: form.vendor_public_id,
      payment_term_public_id: form.payment_term_public_id || null,
      bill_date: form.bill_date,
      due_date: form.bill_date,
      bill_number: form.bill_number,
      // Sum across ALL populated lines — the header value reflects the
      // full bill, not just the summary line.
      total_amount: hasLineData ? totalAmount : null,
      memo: form.memo || null,
      is_draft: true,
      submit_for_review: false,
    };
    if (first) {
      body.line_description = first.description || null;
      body.line_quantity = first.quantity !== "" ? Number(first.quantity) : null;
      body.line_rate = first.rate !== "" ? Number(first.rate) : null;
      body.line_amount = first.amount !== "" ? Number(first.amount) : null;
      body.line_markup = first.markup !== "" ? Number(first.markup) : null;
      body.line_price = first.price !== "" ? Number(first.price) : null;
      body.line_is_billable = first.is_billable;
      body.line_sub_cost_code_id =
        first.sub_cost_code_id !== "" ? Number(first.sub_cost_code_id) : null;
      body.line_project_public_id = first.project_public_id || null;
      if (first.coding_prefill_state !== undefined) {
        body.line_coding_prefill_state = first.coding_prefill_state;
      }
    }
    return body;
  };

  const lineItemBodyExtras = (li: LineItemDraft): Record<string, unknown> => {
    if (li.coding_prefill_state === undefined) return {};
    return { coding_prefill_state: li.coding_prefill_state };
  };

  const handleSubmit = async (action: "save" | "submit" | "complete") => {
    if (!file) {
      setSaveError("A PDF attachment is required.");
      return;
    }
    if (readingAttachment) {
      setSaveError("Wait for the invoice read to finish.");
      return;
    }
    if (hasPrefilledSuggestions) {
      setSaveError(UNREVIEWED_PREFILL_MSG);
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusyAction(action);
    setSaveError("");
    try {
      let attId = attachmentPublicId;
      if (!attId) {
        const attachment = await uploadFile<AttachmentResponse>(
          "/api/v1/upload/attachment",
          file,
        );
        attId = attachment.public_id;
      }
      const created = await post<Bill>("/api/v1/create/bill", {
        ...buildBody(),
        attachment_public_id: attId,
      });

      // Additional populated lines beyond the inline summary. Each one is
      // its own POST — the API has no batch-create-with-lines endpoint. If
      // any of them fails, the bill still exists (with its summary line and
      // attachment); we redirect to /edit with a toast and let the user
      // finish there. Reversing the bill would need a server transaction we
      // don't have and would lose the attachment upload work.
      // Which lines actually made it to the server. The summary line lands
      // with the create call itself; each additional line joins only once its
      // own POST resolves, so this array — not the full populatedLines — is
      // what the corrected header total must be summed from.
      const persistedLines = populatedLines.slice(0, 1);
      const additionalLines = populatedLines.slice(1);
      const failedLineNumbers: number[] = [];
      for (let i = 0; i < additionalLines.length; i++) {
        const li = additionalLines[i];
        try {
          await post("/api/v1/create/bill_line_item", {
            bill_public_id: created.public_id,
            sub_cost_code_id:
              li.sub_cost_code_id !== "" ? Number(li.sub_cost_code_id) : null,
            project_public_id: li.project_public_id || null,
            description: li.description || null,
            quantity: li.quantity !== "" ? Number(li.quantity) : null,
            rate: li.rate !== "" ? Number(li.rate) : null,
            amount: li.amount !== "" ? Number(li.amount) : null,
            is_billable: li.is_billable,
            markup: li.markup !== "" ? Number(li.markup) : null,
            price: li.price !== "" ? Number(li.price) : null,
            ...lineItemBodyExtras(li),
          });
          persistedLines.push(li);
        } catch {
          // +2 because populatedLines[0] is line #1 (summary), so
          // additionalLines[0] is line #2, etc. Human-readable numbering.
          failedLineNumbers.push(i + 2);
        }
      }
      if (failedLineNumbers.length > 0) {
        // Do NOT submit for review — recipient resolution walks all BLIs,
        // and this bill is incomplete until the failed lines are saved.
        const single = failedLineNumbers.length === 1;
        const submitNote =
          action === "submit"
            ? " The bill was NOT submitted for review — finish the lines and submit from the edit page."
            : "";
        // The create call posted a total covering EVERY populated line, so a
        // failed line leaves the header overstated. Correct it to what actually
        // persisted. Gated on can_update because /update/bill enforces it while
        // the create path only needs can_create — a create-only user keeps the
        // overstated total until someone with update rights fixes it.
        // NB the API coerces `... if body.total_amount else None`, and Decimal(0)
        // is falsy in Python, so a corrected total of exactly 0 lands as NULL
        // (blank header) rather than 0.00 — still better than leaving it
        // overstated. Fixing that belongs in build.one.api, not here.
        let totalCorrected = false;
        if (hasUpdatePerm) {
          try {
            await put(`/api/v1/update/bill/${created.public_id}`, {
              row_version: created.row_version,
              vendor_public_id: form.vendor_public_id,
              payment_term_public_id: form.payment_term_public_id || undefined,
              bill_date: form.bill_date,
              due_date: form.bill_date,
              bill_number: form.bill_number,
              total_amount: sumLineAmounts(persistedLines),
              memo: form.memo || null,
              is_draft: true,
            });
            totalCorrected = true;
          } catch {
            // Correcting the total is best-effort — never block the user off
            // the bill for it. The toast says so instead.
          }
        }
        const totalNote = totalCorrected
          ? " The bill total was corrected to match the saved lines."
          : " The bill total still includes the unsaved line(s) — fix it on the edit page.";
        toast(
          `Bill saved. ` +
            `${single ? "Line" : "Lines"} ` +
            `${failedLineNumbers.join(", ")} failed to save — ` +
            `add ${single ? "it" : "them"} on the edit page.` +
            submitNote +
            totalNote,
          "error",
        );
        navigate(`/bill/${created.public_id}/edit`);
        return;
      }

      const followUp =
        action === "submit"
          ? {
              path: `/api/v1/submit/review/bill/${created.public_id}`,
              label: "Submit for review",
              retry: "Retry from this page.",
            }
          : action === "complete"
            ? {
                path: `/api/v1/complete/bill/${created.public_id}`,
                label: "Completion",
                retry: "Retry Complete from this page.",
              }
            : null;
      if (followUp) {
        try {
          // Both follow-ups return fast, so we navigate as soon as they
          // resolve. /submit/review is fast because the API stores a blob
          // reference on the outbox row and the worker fetches the PDF at
          // drain time (U-520); before that it downloaded the bill PDF from
          // blob storage, base64-encoded it, and wrote up to 5.73 MB into
          // ms.Outbox.Payload inside the request. /complete/bill returns 202
          // and drains in the background.
          await post(followUp.path, {});
        } catch (err: any) {
          // Bill + all lines were created OK but the follow-up action failed.
          // Re-creating would hit a (vendor, bill_number, date) uniqueness 409;
          // a submit retry could also 409 if a review row already exists. Send
          // to edit where Submit or Complete can retry against the already-
          // created draft.
          toast(
            `Bill saved as draft. ${followUp.label} failed: ${err.message}. ${followUp.retry}`,
            "error",
          );
          navigate(`/bill/${created.public_id}/edit`);
          return;
        }
      }
      // Save For Later stays on /edit so the user can keep working the
      // draft. Submit and Complete return to /bill/list (plain path — the
      // list defaults to In Review). A completed bill will not be on that
      // tab (status becomes completed, and asynchronously at that), so the
      // toast is the confirmation Complete gets.
      if (action === "complete") {
        toast("Bill completed — external syncs continue in the background.");
      } else if (action === "submit") {
        toast("Submitted for review.");
      }
      navigate(
        action === "save"
          ? `/bill/${created.public_id}/edit`
          : "/bill/list",
      );
    } catch (err: any) {
      setSaveError(err.message);
      endAction();
    }
  };

  const projectOptions = (lookups.projects ?? []).map((p) => ({
    value: p.public_id,
    label: p.abbreviation ? `${p.abbreviation} — ${p.name}` : p.name,
  }));
  const sccOptions = (lookups.sub_cost_codes ?? []).map((s) => ({
    value: String(s.id),
    label: s.number ? `${s.number} — ${s.name}` : s.name,
  }));

  return (
    <div className="page form-page-wide">
      <Breadcrumb crumbs={entityCrumbs("Bills", "/bill/list", "Create")} />
      <div className="page-header"><h1>Create Bill</h1></div>
      <form
        className="detail-card"
        onSubmit={(e) => {
          e.preventDefault();
          // pendingActionRef is set by whichever button initiated the
          // submit. Defaults to "save" so an Enter-key submission from
          // a header field behaves like Save For Later (the safest of
          // the three — no notification, no completion side effects).
          const action = pendingActionRef.current ?? "save";
          pendingActionRef.current = null;
          handleSubmit(action);
        }}
        // If HTML5 validation blocks the submit, clear the pending action
        // so a follow-up Enter-key submission doesn't silently inherit
        // the previous button's intent (e.g. firing Complete after the
        // user fixed a missing field and pressed Enter to retry a Save).
        onInvalid={() => { pendingActionRef.current = null; }}
      >
        {saveError && <div className="form-error">{saveError}</div>}

        {/* Header fields as label-left / input-right rows, matching BillView's
            .detail-row shape. The .detail-fields-form class flips each
            enclosed .form-group (rendered by FormField/SelectField/etc.) to
            a horizontal layout with a thin divider between rows. */}
        <div className="detail-fields-form">
          <SelectField
            label="Vendor"
            name="vendor_public_id"
            value={form.vendor_public_id}
            onChange={onChange}
            options={(lookups.vendors ?? []).map((v) => ({ value: v.public_id, label: v.name }))}
            required
            adornment={prefillAdornment(headerPrefill, "vendor_public_id", "", acceptHeaderField, busy)}
          />
          <FormField
            label="Bill Number"
            name="bill_number"
            value={form.bill_number}
            onChange={onChange}
            required
            adornment={prefillAdornment(headerPrefill, "bill_number", "", acceptHeaderField, busy)}
          />
          <DateField
            label="Bill Date"
            name="bill_date"
            value={form.bill_date}
            onChange={onChange}
            required
            adornment={prefillAdornment(headerPrefill, "bill_date", "", acceptHeaderField, busy)}
          />
          {/* Read-only: dbo.CreateBill / dbo.UpdateBillById persist DueDate = BillDate and
              ignore @DueDate, so an editable due date here would mislead the user. Payment
              Term (PaymentTermId) is what actually drives when payment is owed. */}
          <div className="form-group">
            <label>Due Date</label>
            <div id="due_date_display" className="form-value">{form.bill_date || "—"}</div>
          </div>
          <SelectField
            label="Payment Term"
            name="payment_term_public_id"
            value={form.payment_term_public_id}
            onChange={onChange}
            options={(lookups.payment_terms ?? []).map((pt) => ({ value: pt.public_id, label: pt.name }))}
          />
          <TextareaField label="Memo" name="memo" value={form.memo} onChange={onChange} />
        </div>

        {/* ─── Line Item Details (optional) ────────────────────────────── */}
        <div className="li-cards-section" style={{ marginTop: 16 }}>
          <div className="inline-li-header inline-li-header-with-hint">
            <h3 className="line-items-heading">Line Item Details</h3>
            <span className="text-muted inline-li-header-hint" style={{ fontSize: 12 }}>
              Optional — fill in to enable Submit for Review.
            </span>
            <div className="inline-li-header-actions">
              {budgetChip && (
                <span className={budgetChip.className}>{budgetChip.label}</span>
              )}
              {hasPrefilledSuggestions && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={acceptAllSuggestions}
                  disabled={busy}
                >
                  Accept all suggestions
                </button>
              )}
            </div>
          </div>
          <table className="data-table line-items-edit-table bill-create-lines">
            <thead>
              <tr>
                <th>Description</th>
                <th>Sub Cost Code</th>
                <th>Project</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Rate</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "right" }}>Markup</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "center" }}>Billable</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((li, index) => {
                const sccBadge =
                  lineShowsSuggestionBadgeFor(li) ? (
                    <div className="coding-suggestion-actions coding-suggestion-actions-compact">
                      <span
                        className={suggestionBadgeClassName(li.coding_suggestion_confidence ?? null)}
                        title={li.coding_suggestion_reason ?? undefined}
                      >
                        {formatSuggestionBadgeLabel(
                          li.coding_suggestion_confidence ?? null,
                          li.coding_suggestion_source,
                        )}
                      </span>
                      {li.coding_prefill_state === "prefilled" && (
                        <button
                          type="button"
                          className="btn-coding-accept"
                          title="Accept suggestion"
                          aria-label={`Accept sub cost code suggestion for line ${index + 1}`}
                          onClick={() => acceptLineSuggestion(index)}
                        >
                          ✓
                        </button>
                      )}
                    </div>
                  ) : null;
                const projectBadge = lineShowsProjectSuggestionMarker(li) ? (
                  <div className="coding-suggestion-actions coding-suggestion-actions-compact">
                    <span
                      className="status-badge coding-suggested status-badge-compact"
                      title="Project predicted from the bill's attachment text"
                    >
                      AI
                    </span>
                  </div>
                ) : null;
                return (
                  <tr key={li.uid}>
                    {lineItemCell(
                      <input
                        className="inline-li-input"
                        value={li.description}
                        onChange={(e) => updateLine(index, "description", e.target.value)}
                      />,
                      li.uid === line1PrefillUid
                        ? prefillAdornment(
                            line1Prefill,
                            "description",
                            "line 1 ",
                            acceptLine1Field,
                            busy,
                          )
                        : null,
                    )}
                    {lineItemCell(
                      <select
                        className="inline-li-input"
                        value={li.sub_cost_code_id}
                        onChange={(e) => updateLine(index, "sub_cost_code_id", e.target.value)}
                      >
                        <option value="">—</option>
                        {sccOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>,
                      sccBadge,
                    )}
                    {lineItemCell(
                      <select
                        className="inline-li-input"
                        value={li.project_public_id}
                        onChange={(e) => {
                          setProjectHintForSuggest(e.target.value || undefined);
                          updateLine(index, "project_public_id", e.target.value);
                        }}
                      >
                        <option value="">—</option>
                        {projectOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>,
                      projectBadge,
                    )}
                    {lineItemCell(
                      <input
                        className="inline-li-input"
                        type="number"
                        step="any"
                        value={li.quantity}
                        onChange={(e) => updateLine(index, "quantity", e.target.value)}
                      />,
                      null,
                      { align: "right" },
                    )}
                    {lineItemCell(
                      <input
                        className="inline-li-input"
                        type="number"
                        step="any"
                        value={li.rate}
                        onChange={(e) => updateLine(index, "rate", e.target.value)}
                      />,
                      li.uid === line1PrefillUid
                        ? prefillAdornment(
                            line1Prefill,
                            "rate",
                            "line 1 ",
                            acceptLine1Field,
                            busy,
                            true,
                          )
                        : null,
                      { align: "right" },
                    )}
                    {lineItemCell(
                      <div className="line-item-readonly inline-li-computed">{fmtMoney(li.amount)}</div>,
                      null,
                      { align: "right", computed: true },
                    )}
                    {lineItemCell(
                      <input
                        className="inline-li-input"
                        type="number"
                        step="any"
                        placeholder="0.10"
                        value={li.markup}
                        onChange={(e) => updateLine(index, "markup", e.target.value)}
                      />,
                      null,
                      { align: "right" },
                    )}
                    {lineItemCell(
                      <div className="line-item-readonly inline-li-computed">{fmtMoney(li.price)}</div>,
                      null,
                      { align: "right", computed: true },
                    )}
                    {lineItemCell(
                      <input
                        type="checkbox"
                        checked={li.is_billable}
                        onChange={(e) => updateLine(index, "is_billable", e.target.checked)}
                      />,
                      null,
                      { align: "center" },
                    )}
                    {lineItemCell(
                      lines.length > 1 ? (
                        <button
                          type="button"
                          className="inline-li-remove"
                          onClick={() => removeLine(index)}
                          title="Remove this line"
                          aria-label={`Remove line ${index + 1}`}
                        >
                          &times;
                        </button>
                      ) : null,
                      null,
                      { align: "center" },
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addLine}
              disabled={busy}
            >
              + Add Line
            </button>
          </div>

          <div style={{ marginTop: 8, textAlign: "right", fontSize: 14 }}>
            Total Amount: <strong>{fmtMoney(String(totalAmount))}</strong>
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/bill/list")}
            disabled={busyAction !== null}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !file || hasPrefilledSuggestions}
            onClick={() => { pendingActionRef.current = "save"; }}
            title={saveBlockedTitle ?? "Save the bill as a draft and continue editing on the next page."}
          >
            {busyAction === "save" ? "Saving..." : "Save For Later"}
          </button>
          <button
            type="submit"
            className="btn btn-success"
            disabled={busy || !file || !canSubmitForReview}
            onClick={() => { pendingActionRef.current = "submit"; }}
            title={submitForReviewTitle}
          >
            {busyAction === "submit" ? "Submitting..." : "Submit For Review"}
          </button>
          {canCompleteBills && (
            <button
              type="submit"
              className="btn btn-success"
              disabled={busy || !file || !canCompleteFromHere}
              onClick={() => { pendingActionRef.current = "complete"; }}
              title={
                canCompleteFromHere
                  ? "Save the bill AND finalize it directly — bypasses review, kicks off SharePoint / Excel / QBO push."
                  : hasPrefilledSuggestions
                    ? UNREVIEWED_PREFILL_MSG
                    : "Set both Project and Sub Cost Code on the line item to enable Complete."
              }
            >
              {busyAction === "complete" ? "Completing..." : "Complete Bill"}
            </button>
          )}
        </div>

        {/* Attachment section — full-width at the bottom of the card. Actions
            live ABOVE this block so the user doesn't have to page past the
            PDF preview to reach Submit / Complete. */}
        <div className="pdf-viewer">
          <h3 className="line-items-heading">
            Attachment <span style={{ color: "#c00" }}>*</span>
          </h3>
          {readingAttachment && (
            <p className="bill-read-status text-muted" role="status">
              Reading invoice…
            </p>
          )}
          {readInlineMessage && !readingAttachment && (
            <p className="bill-read-status bill-read-status-warn" role="status">
              {readInlineMessage}
            </p>
          )}
          {previewUrl ? (
            <>
              <iframe
                src={`${previewUrl}#view=FitH&navpanes=0`}
                title="Bill PDF preview"
              />
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {file?.name} ({file ? Math.round(file.size / 1024) : 0} KB)
                {" · "}
                <button
                  type="button"
                  className="drop-zone-browse"
                  onClick={() => clearPdfAttachment()}
                  disabled={busyAction !== null}
                >
                  Change file
                </button>
              </div>
            </>
          ) : (
            <div
              className={`drop-zone ${dragOver ? "drop-zone-active" : ""}`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <span className="drop-zone-icon">📄</span>
              <p className="drop-zone-text">Drop the PDF here</p>
              <p className="drop-zone-subtext">
                or{" "}
                <button
                  type="button"
                  className="drop-zone-browse"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  browse files
                </button>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={onFileChange}
                disabled={busy}
              />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
