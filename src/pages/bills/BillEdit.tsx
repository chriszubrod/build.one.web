import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEntityItem, entityItemKey } from "../../hooks/useEntity";
import { useDeleteDocument } from "../../hooks/useDeleteDocument";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useSyncedToken } from "../../hooks/useSyncedToken";
import { useServerOwnedRebase } from "../../hooks/useServerOwnedRebase";
import { useToast } from "../../components/Toast";
import { put, post, del, getList, getOne, ApiError } from "../../api/client";
import { useCompletionPolling } from "../../hooks/useCompletionPolling";
import CompletionStatusBar from "../../components/CompletionStatusBar";
import { useViewAttachmentObjectUrl } from "../../hooks/useViewAttachmentObjectUrl";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { resolveBillEditActions } from "./billPermissions";
import { useEntityList } from "../../hooks/useEntity";
import type { Vendor as FullVendor, SubCostCode, Project } from "../../types/api";
import { computeBillLine, sumLineAmounts } from "./lineMath";
import InlineLineItems from "../../components/InlineLineItems";
import BillHeaderFields, { type BillHeaderFormValues } from "./BillHeaderFields";
import LineItemAttachment from "../../components/LineItemAttachment";
import {
  BILL_LINE_COL,
  buildBillLineFields,
  fmtBillLineMoney,
  projectOptionLabel,
  type BillLineRow,
} from "./billLineFields";
import ReviewTimeline from "../../components/ReviewTimeline";
import RecordChangedBanner from "../../components/RecordChangedBanner";
import Breadcrumb from "../../components/Breadcrumb";
import type { Bill, BillIntakePrediction, BillLineItem } from "../../types/api";
import type { HeaderFormSlice } from "./filePrefillLabels";
import type { ReviewActionKind } from "../../components/ReviewTimeline";
import {
  codingSuggestAmountFromLines,
  codingPrefillStateForApi,
  applyUserLinePatch,
  projectHintFromLines,
} from "./codingSuggestion";
import { useBillCodingSuggestion } from "./useBillCodingSuggestion";
import { documentStatus } from "../../shared/documentLifecycle";
import { createEmptyHeaderPrefill, createEmptyLine1Prefill } from "./headerPrefill";
import {
  applyReadAttachmentResult,
  GENERIC_READ_ERROR,
  memoBodyFromPdfRead,
  rereadBillAttachment,
  summarizeReplacedFromPdf,
} from "./readAttachment";

/** Debounced memo for coding suggest; syncs immediately once draft lines have loaded. */
function useDebouncedMemoAfterBaseline(
  memo: string,
  ms: number,
  baselineKey: string | null,
): string {
  const [debounced, setDebounced] = useState(memo);
  const syncedBaselineRef = useRef<string | null>(null);
  useEffect(() => {
    if (baselineKey != null && syncedBaselineRef.current !== baselineKey) {
      syncedBaselineRef.current = baselineKey;
      setDebounced(memo);
      return;
    }
    if (baselineKey == null) return;
    const t = window.setTimeout(() => setDebounced(memo), ms);
    return () => window.clearTimeout(t);
  }, [memo, ms, baselineKey]);
  return debounced;
}

const SUBMIT_REQUIRES_PROJECT_MSG =
  "Add a line item with a project before submitting for review.";

interface LineItemRow extends BillLineRow {
  /** Server row version — stamped back by saveAll via uid. */
  row_version?: string;
}

const computeLineItem = (li: LineItemRow): LineItemRow => computeBillLine(li);

let nextLineUid = 0;
const newLineUid = () => `li-uid-${++nextLineUid}`;

function newLineItem(): LineItemRow {
  return {
    uid: newLineUid(),
    description: "", sub_cost_code_id: "", project_public_id: "",
    quantity: "", rate: "", amount: "", is_billable: true, markup: "", price: "",
  };
}

interface BliaLink {
  public_id: string;
  attachment_id: number | null;
}

const ATTACHMENT_PRESERVE_ERROR =
  "Could not preserve this bill's attachment — nothing was saved and the line was not removed.";

/** U-171: null only on a definitive 404 (the line has no link); other errors propagate. */
async function getBliaLinkForLine(lineItemPublicId: string): Promise<BliaLink | null> {
  try {
    return await getOne<BliaLink>(
      `/api/v1/get/bill-line-item-attachment/by-bill-line-item/${lineItemPublicId}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * U-171: a bill's shared PDF is linked to ONE line item, so removing that line would orphan
 * the document. Before any line delete, re-home the link (create-before-delete) onto a
 * surviving line. Idempotent-create returns an existing row if the target already has a
 * link, so we only target a truly link-free (404) survivor and verify the returned
 * attachment_id. Any failure throws → saveAll's catch aborts with nothing written and the
 * line not removed.
 */
async function rehomeAttachmentsBeforeLineDeletes(
  removedIds: string[],
  survivingIds: string[],
): Promise<void> {
  if (removedIds.length === 0) return;

  for (const removedId of removedIds) {
    const link = await getBliaLinkForLine(removedId);
    // A missing link, or a link with no attachment_id (the column is nullable), has
    // nothing to preserve — never dereference attachment_id blindly (would GET /id/null).
    if (!link?.attachment_id) continue;

    // Scan survivors once. A survivor that already carries THIS attachment means the
    // document is already preserved — a retry after a partial failure, or a post-U-166
    // one-BLIA-per-line bill — so just drop the old link. Otherwise remember the first
    // truly link-free (404) survivor as the re-home target.
    let alreadyPreserved = false;
    let target: string | null = null;
    for (const sid of survivingIds) {
      const sLink = await getBliaLinkForLine(sid);
      if (sLink === null) {
        if (target === null) target = sid;
        continue;
      }
      if (sLink.attachment_id === link.attachment_id) {
        alreadyPreserved = true;
        break;
      }
    }

    if (alreadyPreserved) {
      await del(`/api/v1/delete/bill-line-item-attachment/${link.public_id}`);
      continue;
    }
    // No survivor holds it and none is link-free → re-homing would orphan the document.
    // Abort rather than fall through to the delete loop and remove the line with its link
    // still attached (which would FK-547 / leave a dangling BLIA row).
    if (target === null) throw new Error(ATTACHMENT_PRESERVE_ERROR);

    const att = await getOne<{ public_id: string }>(`/api/v1/get/attachment/id/${link.attachment_id}`);
    const created = await post<BliaLink>("/api/v1/create/bill-line-item-attachment", {
      bill_line_item_public_id: target,
      attachment_public_id: att.public_id,
    });
    // Idempotent-create returns an existing row if target already had ANY link — verify
    // it is OUR attachment or we would silently drop the document on the delete below.
    if (created.attachment_id !== link.attachment_id) {
      throw new Error(ATTACHMENT_PRESERVE_ERROR);
    }
    await del(`/api/v1/delete/bill-line-item-attachment/${link.public_id}`);
  }
}

export default function BillEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const billItemPath = `/api/v1/get/bill/${publicId}`;
  const { item, loading, error } = useEntityItem<Bill>(billItemPath);
  const { items: fullVendors } = useEntityList<FullVendor>("/api/v1/get/vendors");
  const { items: fullPaymentTerms } = useEntityList<{ id: number; public_id: string; name: string }>(
    "/api/v1/get/payment-terms",
  );
  const { items: fullSubCostCodes } = useEntityList<SubCostCode>("/api/v1/get/sub-cost-codes");
  const { items: fullProjects } = useEntityList<Project>("/api/v1/get/projects");
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const actions = resolveBillEditActions(me);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const lineItemsRef = useRef(lineItems);
  lineItemsRef.current = lineItems;
  const [lineItemsLoaded, setLineItemsLoaded] = useState(false);
  const persistedLineTotalRef = useRef<number | null>(null);
  const headerDirtyRef = useRef(false);
  // Counts confirmed header PUTs (auto-save and saveAll) so saveAll can tell whether its
  // own header write is still the newest one before seeding the item cache.
  const headerWriteSeqRef = useRef(0);
  const saveAllInFlightRef = useRef<{
    promise: Promise<boolean>;
    intent: "draft" | "submit";
  } | null>(null);
  const [origLineItemPublicIds, setOrigLineItemPublicIds] = useState<string[]>([]);
  const [attachmentPublicId, setAttachmentPublicId] = useState<string | null>(null);
  const [rereadingAttachment, setRereadingAttachment] = useState(false);
  const rereadInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const publicIdRef = useRef(publicId);
  publicIdRef.current = publicId;
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const { objectUrl: attachmentBlobUrl, loading: attachmentLoading, loadError: attachmentLoadError } =
    useViewAttachmentObjectUrl(attachmentPublicId);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [projectHintForSuggest, setProjectHintForSuggest] = useState<string | undefined>();
  const [lineUserEditEpoch, setLineUserEditEpoch] = useState(0);
  const memoValue = form?.memo ?? "";
  const debouncedMemo = useDebouncedMemoAfterBaseline(
    memoValue,
    400,
    lineItemsLoaded && form ? publicId ?? null : null,
  );
  const { state: pollState, start: startPolling } = useCompletionPolling<Bill>(
    billItemPath,
    {
      isDone: (b) => b.is_draft === false,
      onComplete: (bill) => {
        queryClient.setQueryData(entityItemKey(billItemPath), bill);
        toast("Bill completed — external syncs continue in the background.");
        setForm((prev) => (prev ? { ...prev, is_draft: false } : prev));
        setCompleting(false);
        navigate("/bill/list");
      },
      onError: () => setCompleting(false),
    },
  );

  // Load line items when the bill id or project catalog first becomes available —
  // NOT when the cached bill object is merged after saveAll (U-170 / U-708). The
  // effect reads item.id only; header fields come from the separate form seed/rebase.
  // A different bill remounts via BillEditRoute (keyed by publicId).
  const billIdForLines = item?.id;
  useEffect(() => {
    if (billIdForLines == null || fullProjects.length === 0) return;
    let cancelled = false;
    getList<BillLineItem>(`/api/v1/get/bill_line_items/bill/${billIdForLines}`)
      .then(async (res) => {
        if (cancelled) return;
        setOrigLineItemPublicIds(res.data.map((li) => li.public_id));
        const mapped = res.data.map((li) => {
          const project = fullProjects.find((p) => p.id === li.project_id) ?? null;
          // A stored project absent from the scoped list keeps its numeric id here so a
          // save cannot mistake "cannot render it" for "user cleared it".
          const unresolvedProjectId = project ? undefined : (li.project_id ?? undefined);
          const projectPublicId = project?.public_id ?? "";
          return computeLineItem({
            uid: newLineUid(),
            public_id: li.public_id,
            row_version: li.row_version,
            description: li.description ?? "",
            sub_cost_code_id: li.sub_cost_code_id != null ? String(li.sub_cost_code_id) : "",
            project_public_id: projectPublicId,
            unresolved_project_id: unresolvedProjectId,
            quantity: li.quantity != null ? String(li.quantity) : "",
            rate: li.rate ?? "",
            amount: li.amount ?? "",
            is_billable: li.is_billable ?? true,
            markup: li.markup ?? "",
            price: li.price ?? "",
            coding_prefill_state: li.coding_prefill_state ?? undefined,
          });
        });
        setLineItems(mapped);
        setProjectHintForSuggest(projectHintFromLines(mapped));
        persistedLineTotalRef.current = sumLineAmounts(res.data);
        setLineItemsLoaded(true);

        // U-171: the shared PDF may live on ANY line, not res.data[0]. Probe in order,
        // AFTER setLineItemsLoaded so the Save button is never delayed. `cancelled` guards
        // the longer async chain against a previous bill's attachment landing on this one.
        for (const li of res.data) {
          if (cancelled) return;
          try {
            const blia = await getBliaLinkForLine(li.public_id);
            if (cancelled || !blia?.attachment_id) continue;
            const att = await getOne<{ public_id: string }>(
              `/api/v1/get/attachment/id/${blia.attachment_id}`,
            );
            if (cancelled) return;
            setAttachmentPublicId(att.public_id);
            break;
          } catch {
            // display-only — leave the pane empty and try the next line
          }
        }
      })
      .catch(() => {
        if (!cancelled) setAttachmentPublicId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [billIdForLines, fullProjects]);

  // Which bill `form` was seeded from. The rebase below refuses to take a
  // token from a DIFFERENT bill — see the guard's comment for why that is
  // load-bearing rather than defensive.
  const seededForRef = useRef<string | null>(null);

  // ONE projection for the seed, the baseline, and the divergence test.
  // A separate seed literal and pick literal is how U-464/U-465 were
  // allowed to rebase a token under a body they had never compared.
  const seedFrom = (b: Bill) => ({
    vendor_public_id:
      b.vendor_id != null
        ? (fullVendors.find((v) => v.id === b.vendor_id)?.public_id ?? "")
        : "",
    payment_term_public_id: fullPaymentTerms.find((pt) => pt.id === b.payment_term_id)?.public_id ?? "",
    bill_date: b.bill_date ?? "",
    due_date: b.due_date,
    bill_number: b.bill_number ?? "",
    total_amount: b.total_amount ?? "",
    memo: b.memo ?? "",
    is_draft: b.is_draft,
    row_version: b.row_version,
  });

  const { data: intakePrediction } = useQuery({
    queryKey: ["bill-intake-prediction", publicId],
    queryFn: async (): Promise<BillIntakePrediction | null> => {
      try {
        return await getOne<BillIntakePrediction>(`/api/v1/bill/${publicId}/intake-prediction`);
      } catch {
        return null;
      }
    },
    enabled: !!publicId && !!item,
    retry: false,
  });

  // U-471: rebase the write token only when the freshly-arrived record
  // differs from the last-in-sync baseline solely in server-owned fields.
  // A review transition (U-464) still rebases; a co-editor's memo change
  // does not — that used to 409, then U-464/U-465 made it a silent lost
  // update. owned is exactly {row_version, is_draft}; a bound input here
  // is a lost-update bug. The same-entity guard lives in the hook.
  const { diverged, acceptBaseline } = useServerOwnedRebase({
    item,
    seededFor: seededForRef,
    setForm,
    seedFrom,
    owned: ["row_version", "is_draft"],
  });

  // Init header form. Baseline is captured HERE, not lazily in the hook:
  // this gate waits on vendor/payment-term lists, so `item` often arrives
  // first and keeps its identity when the lists land. A lazy capture keyed
  // on `[item]` would then miss the seed and treat a later co-editor
  // arrival as "in sync".
  if (item && !form && fullVendors.length > 0 && fullPaymentTerms.length > 0) {
    seededForRef.current = item.public_id;
    acceptBaseline(item);
    setForm(seedFrom(item));
  }

  const rowVersion = useSyncedToken(form?.row_version);

  // Auto-save header on changes (300ms debounce)
  const autoSaveHeader = useCallback(async () => {
    const headerForm = formRef.current;
    if (!headerForm || !publicId) return;
    // flush() ignores the enabled gate — must not PUT until line items have loaded.
    if (persistedLineTotalRef.current == null) return;
    if (!headerDirtyRef.current) return;
    headerDirtyRef.current = false;
    try {
      // Auto-save sends the last-PERSISTED line total so the server total always
      // matches server lines; live UI sums only go up with explicit saveAll.
      const updated = await put<Bill>(`/api/v1/update/bill/${publicId}`, {
        row_version: rowVersion.read(),
        vendor_public_id: headerForm.vendor_public_id || undefined,
        payment_term_public_id: headerForm.payment_term_public_id || undefined,
        bill_date: headerForm.bill_date,
        due_date: headerForm.bill_date, // DueDate = BillDate (U-681)
        bill_number: headerForm.bill_number,
        total_amount: persistedLineTotalRef.current,
        memo: headerForm.memo || null,
        is_draft: headerForm.is_draft,
      });
      rowVersion.set(updated.row_version);
      ++headerWriteSeqRef.current;
      acceptBaseline(updated);
      setForm((prev: any) => (prev ? { ...prev, row_version: updated.row_version } : prev));
    } catch {
      headerDirtyRef.current = true;
      // Silent fail for auto-save — stale-token loop is prevented by useSyncedToken;
      // manual Save / Complete / Submit-for-Review still surface errors via saveAll.
    }
  }, [publicId, rowVersion, acceptBaseline]);

  // Line items intentionally omitted from deps — a coalesced follow-up could run
  // before React commits a just-created row's public_id and duplicate-CREATE it.
  const { flush: flushAutoSave, cancel: cancelAutoSave } = useAutoSave(
    autoSaveHeader,
    [
      form?.vendor_public_id,
      form?.payment_term_public_id,
      form?.bill_date,
      form?.due_date,
      form?.bill_number,
      form?.memo,
      lineItemsLoaded,
    ],
    300,
    // auto-save total is computed from lineItems — must not run before they load;
    // auto-save PUTs the can_update-guarded /update/bill route — must not arm without canEdit
    !!form &&
      !!item &&
      lineItemsLoaded &&
      form.is_draft &&
      !completing &&
      !rereadingAttachment &&
      actions.canEdit,
  );

  // A debounce armed on the previous bill must not fire after a /bill/:id/edit param
  // change; the stale PUT could not land anyway (RowVersion WHERE-guard) but don't emit it.
  useEffect(() => {
    cancelAutoSave();
  }, [publicId, cancelAutoSave]);

  // Permission can be revoked mid-edit (AuthContext invalidates ['me'] on the
  // SSE profile_changed event). useAutoSave's effect keys only on its deps
  // array, so flipping enabled false does not clear a timer that is already
  // armed — cancel it explicitly the moment canEdit goes false.
  useEffect(() => {
    if (!actions.canEdit) cancelAutoSave();
  }, [actions.canEdit, cancelAutoSave]);

  const { deleting, runDelete: runDeleteBill } = useDeleteDocument({
    deletePath: publicId ? `/api/v1/delete/bill/${publicId}` : "",
    confirmText: "Delete this bill? This cannot be undone.",
    successToast: "Bill deleted.",
    errorFallback: "Could not delete bill.",
    navigateTo: "/bill/list",
    beforeDelete: cancelAutoSave,
    removeQueryKeys: publicId
      ? [entityItemKey(billItemPath), ["bill-intake-prediction", publicId] as const]
      : [],
  });

  const codingSuggestEnabled =
    !!item?.is_draft &&
    !!form?.is_draft &&
    !!form?.vendor_public_id &&
    lineItemsLoaded &&
    !!publicId;

  const codingProjectHint =
    projectHintForSuggest ?? projectHintFromLines(lineItems);
  const codingSuggestAmount = codingSuggestAmountFromLines(lineItems, codingProjectHint);
  const debouncedCodingAmount = useDebouncedValue(codingSuggestAmount ?? "", 400);

  const { budgetChip } = useBillCodingSuggestion({
    enabled: codingSuggestEnabled,
    vendor_public_id: form?.vendor_public_id ?? "",
    memo: memoValue,
    debouncedMemo,
    debouncedAmount: codingSuggestAmount == null ? undefined : debouncedCodingAmount,
    projectHintForSuggest,
    lines: lineItems,
    sccCatalog: fullSubCostCodes,
    bill_public_id: publicId,
    setLines: setLineItems,
    textSuggestionPoll: codingSuggestEnabled,
    lineUserEditEpoch,
  });

  if (loading || meLoading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  // Every write path on this page — Save, the 300ms auto-save, and the
  // pre-save inside Complete / Submit-for-Review — issues the same
  // can_update-guarded PUT /update/bill. Without can_update the form can
  // only produce silent 403s, so don't render it at all.
  if (!actions.canEdit) {
    return (
      <div className="page">
        <div className="page-error">You don&apos;t have permission to edit this bill.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/bill/${publicId}`)}>
          Back to Bill
        </button>
      </div>
    );
  }

  const onChange = (name: string, value: string) => {
    headerDirtyRef.current = true;
    setForm((prev: any) => ({ ...prev, [name]: value }));
  };

  const showRereadPdf =
    !!item &&
    documentStatus(item) === "draft" &&
    lineItemsLoaded &&
    attachmentPublicId != null &&
    actions.canEdit;

  const formLocked = rereadingAttachment;

  const REREAD_CONFIRM =
    "Replace this draft's vendor, bill number, date, memo, amount, description and coding with what the PDF says?";

  const handleRereadPdf = async () => {
    if (!publicId || rereadingAttachment || rereadInFlightRef.current || !showRereadPdf) return;
    if (!confirm(REREAD_CONFIRM)) return;
    rereadInFlightRef.current = true;
    const billPublicIdAtClick = publicId;
    await flushAutoSave();
    setRereadingAttachment(true);
    try {
      const result = await rereadBillAttachment(billPublicIdAtClick);
      if (!mountedRef.current || publicIdRef.current !== billPublicIdAtClick) {
        return;
      }
      if (result.status === "ai_unavailable") {
        toast(result.message?.trim() || "AI suggestions are paused for today", "info");
        return;
      }
      if (result.status === "disabled") {
        return;
      }
      if (
        result.status !== "ok" &&
        result.status !== "partial"
      ) {
        toast(result.message?.trim() || GENERIC_READ_ERROR, "error");
        return;
      }
      const latestForm = formRef.current;
      const latestLines = lineItemsRef.current;
      if (!latestForm) return;
      const replaceLine1 = latestLines.length === 1;
      const vendors = fullVendors.map((v) => ({ public_id: v.public_id, name: v.name }));
      const sccCatalog = fullSubCostCodes.map((s) => ({ id: s.id, public_id: s.public_id }));
      const outcome = applyReadAttachmentResult({
        result,
        form: {
          vendor_public_id: latestForm.vendor_public_id ?? "",
          payment_term_public_id: latestForm.payment_term_public_id ?? "",
          bill_date: latestForm.bill_date ?? "",
          due_date: latestForm.due_date ?? "",
          bill_number: latestForm.bill_number ?? "",
          memo: latestForm.memo ?? "",
        },
        headerPrefill: createEmptyHeaderPrefill(),
        line1Prefill: createEmptyLine1Prefill(),
        lines: latestLines,
        vendors,
        sccCatalog,
        applyMode: "editReread",
        replaceLine1,
      });
      if (outcome.inlineMessage) {
        toast(outcome.inlineMessage, "error");
        return;
      }
      let replacedLabels = [...(outcome.replacedFieldLabels ?? [])];
      let nextForm = { ...latestForm, ...outcome.form };
      if (outcome.memoSource) {
        const memoFromRead = memoBodyFromPdfRead(
          outcome.memoSource.longDescription,
          outcome.memoSource.reference,
        );
        if (memoFromRead.trim() !== "") {
          nextForm = { ...nextForm, memo: memoFromRead };
          if (!replacedLabels.includes("memo")) {
            replacedLabels.push("memo");
          }
        }
      }
      const nextLines = replaceLine1 ? outcome.lines : latestLines;
      formRef.current = nextForm;
      lineItemsRef.current = nextLines;
      setForm(nextForm);
      if (replaceLine1) {
        setLineItems(nextLines);
      }
      const saved = await saveAll();
      if (saved) {
        toast(
          summarizeReplacedFromPdf(replacedLabels, !replaceLine1),
          "success",
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const msg =
          err.status === 404
            ? "No attachment on this bill or you don't have access."
            : err.status === 409
              ? "Re-read PDF is only available for draft bills."
              : err.detail || GENERIC_READ_ERROR;
        toast(msg, "error");
      } else {
        toast(GENERIC_READ_ERROR, "error");
      }
    } finally {
      rereadInFlightRef.current = false;
      setRereadingAttachment(false);
    }
  };

  const saveAll = async (opts?: { recordReviewedPrefill?: boolean }): Promise<boolean> => {
    const wireIntent = opts?.recordReviewedPrefill ? ("submit" as const) : ("draft" as const);
    const inFlight = saveAllInFlightRef.current;
    if (inFlight) {
      if (inFlight.intent === wireIntent) {
        return inFlight.promise;
      }
      const priorOk = await inFlight.promise;
      if (!priorOk) return false;
      return saveAll(opts);
    }
    let releaseInFlight!: (result: boolean) => void;
    const inFlightGate = new Promise<boolean>((resolve) => {
      releaseInFlight = resolve;
    });
    saveAllInFlightRef.current = { promise: inFlightGate, intent: wireIntent };

    const run = async (): Promise<boolean> => {
    const latestForm = formRef.current;
    if (!latestForm) return false;
    // Pre-load, computedTotal over empty lineItems would PUT total_amount 0.
    if (!lineItemsLoaded) return false;
    setSaving(true);
    setSaveError("");
    try {
      await flushAutoSave(); // flush clears headerDirtyRef when it runs; do not clear again after header PUT (mid-flight edits must stay dirty for debounce)

      // U-171: re-home the shared attachment BEFORE the header PUT and any line delete —
      // create-before-delete, so the document is never orphaned, and an abort here leaves
      // the header and the deletes untouched (nothing written, the line not removed).
      const linesToSave = lineItemsRef.current;
      const survivingIds = linesToSave.filter((li) => li.public_id).map((li) => li.public_id!);
      const currentIds = new Set(survivingIds);
      const removedIds = origLineItemPublicIds.filter((id) => !currentIds.has(id));
      await rehomeAttachmentsBeforeLineDeletes(removedIds, survivingIds);

      // Save header — total_amount computed from line items
      const computedTotal = sumLineAmounts(linesToSave);
      const itemCacheRowVersion = () =>
        queryClient.getQueryData<Bill>(entityItemKey(billItemPath))?.row_version;
      const itemTokenAtSend = itemCacheRowVersion();
      const updated = await put<Bill>(`/api/v1/update/bill/${publicId}`, {
        row_version: rowVersion.read(),
        vendor_public_id: latestForm.vendor_public_id || undefined,
        payment_term_public_id: latestForm.payment_term_public_id || undefined,
        bill_date: latestForm.bill_date,
        due_date: latestForm.bill_date, // DueDate = BillDate (U-681)
        bill_number: latestForm.bill_number,
        total_amount: computedTotal,
        memo: latestForm.memo || null,
        is_draft: latestForm.is_draft,
      });
      rowVersion.set(updated.row_version);
      const headerWriteSeq = ++headerWriteSeqRef.current;
      acceptBaseline(updated);
      setForm((prev: any) => ({ ...prev, row_version: updated.row_version }));

      // Line-item sync (U-170). The retry-safety invariant is scoped to
      // CONFIRMED progress — any mutation whose response we actually received:
      // a retry never fails because of that progress (any remaining 409 is a
      // real concurrency conflict, not a self-inflicted stale row_version or
      // duplicate CREATE). So each confirmed fact is committed through a
      // functional updater the instant it lands, never accumulated in a local
      // array and written back in one shot after the loop — a blanket
      // setLineItems(closureArray) would also clobber edits the user typed
      // during the awaits. The ambiguous-response gap is known and tracked
      // separately: if a PUT/POST commits server-side but the response is lost,
      // setState never runs, so a retry re-sends a stale row_version (409) or
      // re-creates the row (duplicate). That residual cannot be closed
      // client-side without server-side idempotency keys or a post-failure
      // reconciliation refetch. ExpenseEdit / BillCreditEdit / BudgetEdit still
      // carry the un-fixed accumulate-then-commit shape — extract the shared
      // sync (TODO.md) rather than copying this loop a fourth time.
      for (const origId of removedIds) {
        await del(`/api/v1/delete/bill_line_item/${origId}`);
        setOrigLineItemPublicIds((prev) => prev.filter((id) => id !== origId));
      }

      const stampConfirmedLineResponse = (
        uid: string,
        result: BillLineItem,
        codingPrefillAtSend: LineItemRow["coding_prefill_state"],
        isCreate: boolean,
      ) =>
        setLineItems((prev) =>
          prev.map((r) => {
            if (r.uid !== uid) return r;
            const next: LineItemRow = { ...r, row_version: result.row_version };
            if (isCreate) {
              next.public_id = result.public_id;
            }
            if (
              result.coding_prefill_state !== undefined &&
              r.coding_prefill_state === codingPrefillAtSend
            ) {
              next.coding_prefill_state = result.coding_prefill_state ?? undefined;
            }
            return next;
          }),
        );

      for (const li of linesToSave) {
        const body = {
          bill_public_id: publicId!,
          sub_cost_code_id: li.sub_cost_code_id !== "" ? Number(li.sub_cost_code_id) : null,
          description: li.description || null,
          quantity: li.quantity !== "" ? Number(li.quantity) : null,
          rate: li.rate !== "" ? Number(li.rate) : null,
          amount: li.amount !== "" ? Number(li.amount) : null,
          is_billable: li.is_billable,
          markup: li.markup !== "" ? Number(li.markup) : null,
          price: li.price !== "" ? Number(li.price) : null,
          // entities/bill_line_item/business/service.py:188 — API assigns ProjectId only when
          // project_public_id is not None, so OMITTING the key preserves the stored project.
          // Scope-invisible projects have no public_id to send; sending one 400s. An explicit
          // user clear still sends null. Omitting (rather than null) is forward-safe if the
          // API later makes null mean "clear" (U-172).
          ...(li.unresolved_project_id == null
            ? { project_public_id: li.project_public_id || null }
            : {}),
          ...(() => {
            const wired = codingPrefillStateForApi(li.coding_prefill_state, wireIntent);
            return wired !== undefined ? { coding_prefill_state: wired } : {};
          })(),
        };

        const codingPrefillAtSend = li.coding_prefill_state;

        if (li.public_id) {
          const result = await put<BillLineItem>(`/api/v1/update/bill_line_item/${li.public_id}`, {
            ...body,
            row_version: li.row_version!,
          });
          stampConfirmedLineResponse(li.uid, result, codingPrefillAtSend, false);
        } else {
          const result = await post<BillLineItem>("/api/v1/create/bill_line_item", body);
          stampConfirmedLineResponse(li.uid, result, codingPrefillAtSend, true);
          // Register the new id as server-known at once: if the user removes this
          // row before the next save, the delete loop above must still see it, or
          // the line is orphaned server-side. Append is idempotent because the
          // load effect can re-run mid-save and re-seed the list from the server
          // (which, post-POST, already contains this id).
          setOrigLineItemPublicIds((prev) =>
            prev.includes(result.public_id) ? prev : [...prev, result.public_id],
          );
        }
      }
      persistedLineTotalRef.current = computedTotal;
      // Reconcile the item cache only after the line-item loop: an earlier merge would
      // change `item` identity, re-run the load effect, mint new uids, and stampRow would
      // match nothing — silently dropping confirmed public_id/row_version (U-170). Merge,
      // don't replace: the GET (api entities/bill/api/router.py, /get/bill/{public_id})
      // appends a qbo_bill_url the header PUT does not return. Decline seeding when:
      // (1) a mid-loop auto-save superseded this header PUT (headerWriteSeq), or
      // (2) the item cache row_version changed since we sent the header PUT — e.g. a
      // review transition landed in React Query while this saveAll was in flight. Read the
      // cache at check time; a render-lagged ref would miss that and poison the token.
      if (
        headerWriteSeqRef.current === headerWriteSeq &&
        itemCacheRowVersion() === itemTokenAtSend
      ) {
        queryClient.setQueryData(entityItemKey(billItemPath), (prev: Bill | undefined) =>
          prev ? { ...prev, ...updated } : updated,
        );
      }
      return true;
    } catch (err: any) {
      // Failed saveAll may have partially synced lines or failed the header PUT —
      // persisted total is untrustworthy; null disables auto-save until explicit Save succeeds.
      persistedLineTotalRef.current = null;
      setSaveError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
    };
    void run()
      .then(releaseInFlight)
      .catch(() => releaseInFlight(false));
    try {
      return await inFlightGate;
    } finally {
      if (saveAllInFlightRef.current?.promise === inFlightGate) {
        saveAllInFlightRef.current = null;
      }
    }
  };

  const handleSave = async () => {
    if (await saveAll()) {
      navigate("/bill/list");
    }
  };

  const handleComplete = async () => {
    if (!confirm("Complete this bill? This finalizes it and syncs to SharePoint, Excel, and QBO.")) return;
    const saved = await saveAll({ recordReviewedPrefill: true });
    if (!saved) return;
    setCompleting(true);
    cancelAutoSave();
    setSaveError("");
    try {
      await post(`/api/v1/complete/bill/${publicId}`, {});
      startPolling();
    } catch (err: any) {
      setSaveError(err.message);
      setCompleting(false);
    }
  };

  const handleSubmitForReview = async () => {
    // Flush pending edits before submitting — otherwise the notification
    // would resolve recipients against stale line items. Same discipline
    // the Complete handler follows.
    const saved = await saveAll({ recordReviewedPrefill: true });
    if (!saved) return;
    setSubmitting(true);
    setSaveError("");
    try {
      await post(`/api/v1/submit/review/bill/${publicId}`, {});
      toast("Submitted for review — notification queued.");
      navigate("/bill/list");
    } catch (err: any) {
      setSaveError(err.message);
      setSubmitting(false);
    }
  };

  // Recipient resolution (PMs / Owners) walks Bill → BillLineItem → Project →
  // UserProject. With no project on any line item, no PMs are found and the
  // notification ships BCC-only with a blank body — the exact bug that
  // motivated moving Submit off the create path. Gate the button until at
  // least one line item carries a project — including scope-invisible projects
  // tracked via unresolved_project_id, which still have a stored ProjectId.
  const hasProjectOnLineItem = lineItems.some(
    (li) => !!li.project_public_id || li.unresolved_project_id != null,
  );

  /** ReviewTimeline shares one hook for submit/advance/decline. Flush edits on
   * every action (ExpenseEdit precedent); gate the BCC-only notification bug only
   * on the submit/resubmit path — advance/decline must stay reachable without a
   * project so a stuck bill can still be declined. */
  const beforeReviewAction = async (action?: ReviewActionKind): Promise<boolean> => {
    if (action === "submit" && !hasProjectOnLineItem) {
      toast(SUBMIT_REQUIRES_PROJECT_MSG);
      return false;
    }
    const recordReviewedPrefill = action === "submit" || action === "advance";
    return saveAll(recordReviewedPrefill ? { recordReviewedPrefill: true } : undefined);
  };

  // Hoisted out of the line-item map: these depend on neither the row nor its
  // index, and the sub-cost-code catalog is ~500 rows — rebuilding both per row
  // per render meant N×(500+P) allocations on every keystroke in the table.
  // Same shape BillCreate computes once in its component body.
  const sccOptions = fullSubCostCodes.map((s) => ({
    value: String(s.id),
    label: s.number ? `${s.number} — ${s.name}` : s.name,
  }));
  const projectOptions = fullProjects.map((p) => ({
    value: p.public_id,
    label: projectOptionLabel(p.abbreviation, p.name),
  }));

  const patchLineAt = (index: number, patch: Partial<LineItemRow>, bumpEpoch: boolean) => {
    if (bumpEpoch) setLineUserEditEpoch((n) => n + 1);
    setLineItems((prev) => {
      const updated = prev.map((item, i) => {
        if (i !== index) return item;
        return applyUserLinePatch(item, patch);
      });
      return updated.map(computeLineItem);
    });
  };

  const onLineEdit = (index: number, key: string, value: unknown) => {
    const patch: Partial<LineItemRow> = { [key]: value } as Partial<LineItemRow>;
    if (key === "project_public_id") {
      patch.unresolved_project_id = undefined;
    }
    patchLineAt(index, patch, true);
  };

  const addLineItem = () => {
    setLineItems((prev) => [...prev.map(computeLineItem), computeLineItem(newLineItem())]);
  };

  const removeLineItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const lineFooterTotal = sumLineAmounts(lineItems);

  const displayBillNumber = (item?.bill_number ?? "").trim();
  const billCrumbLabel = displayBillNumber || "Draft";
  const pageHeading = displayBillNumber ? `Edit Bill ${displayBillNumber}` : "Draft bill";
  const showHeaderDiscard = !!item && documentStatus(item) === "draft" && actions.canDelete;
  const formForPrefill: HeaderFormSlice | null = form
    ? {
        is_draft: form.is_draft,
        vendor_public_id: form.vendor_public_id,
        bill_number: form.bill_number,
        bill_date: form.bill_date,
      }
    : null;

  const handleDiscardDraft = () =>
    void runDeleteBill({
      confirmText: "Discard this draft bill? This cannot be undone.",
      successToast: "Draft discarded.",
    });

  return (
    <div className="page form-page-wide">
      <Breadcrumb
        crumbs={[
          { label: "Bills", path: "/bill/list" },
          { label: billCrumbLabel, path: `/bill/${publicId}` },
          { label: "Edit" },
        ]}
      />
      <div className="page-header">
        <h1>{pageHeading}</h1>
        <div className="page-header-spacer" />
        {form && (
          <span className={`status-badge ${form.is_draft ? "draft" : "finalized"}`}>
            {form.is_draft ? "Draft" : "Finalized"}
          </span>
        )}
        {showHeaderDiscard && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={formLocked || saving || completing || submitting || deleting}
            onClick={() => void handleDiscardDraft()}
          >
            {deleting ? "Discarding…" : "Discard draft"}
          </button>
        )}
      </div>
      <form
        className="detail-card"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
      >
        {diverged && <RecordChangedBanner entity="bill" />}
        {saveError && <div className="form-error">{saveError}</div>}

        <fieldset disabled={formLocked} style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
        {publicId && (
          <ReviewTimeline
            parentType="bill"
            parentPublicId={publicId}
            onBeforeAction={beforeReviewAction}
            onAfterSubmit={() => navigate("/bill/list")}
          />
        )}

        <BillHeaderFields
          mode="edit"
          form={form as BillHeaderFormValues}
          onChange={onChange}
          vendorOptions={fullVendors.map((v) => ({ value: v.public_id, label: v.name }))}
          paymentTermOptions={fullPaymentTerms.map((pt) => ({
            value: pt.public_id,
            label: pt.name,
          }))}
          intakePrediction={intakePrediction ?? null}
          formForPrefill={formForPrefill}
        />

        <div className="li-cards-section">
          <InlineLineItems
            layout="measured"
            actionsCol={BILL_LINE_COL.actions}
            headerActions={
              form.is_draft && budgetChip ? (
                <span className={budgetChip.className}>{budgetChip.label}</span>
              ) : null
            }
            addPlacement="below"
            addLabel="+ Add Line"
            minRows={1}
            removeLabel={(index) => `Remove line ${index + 1}`}
            fields={buildBillLineFields({
              mode: "edit",
              sccOptions,
              projectOptions,
              showDraftBadges: form.is_draft,
              intakePrediction: intakePrediction ?? null,
              formForPrefill,
              onProjectHintChange: setProjectHintForSuggest,
            })}
            items={lineItems}
            addDisabled={formLocked}
            onEdit={onLineEdit}
            onAdd={addLineItem}
            onRemove={removeLineItem}
            extraColumn={{
              label: "Attachment",
              col: BILL_LINE_COL.attachment,
              render: (li) =>
                li.public_id ? (
                  <LineItemAttachment lineItemPublicId={li.public_id} entityType="bill" />
                ) : (
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    Save first
                  </span>
                ),
            }}
            footer={
              <div style={{ marginTop: 8, textAlign: "right", fontSize: 14 }}>
                Total Amount:{" "}
                <strong>{fmtBillLineMoney(String(lineFooterTotal))}</strong>
              </div>
            }
          />
        </div>
        </fieldset>

        <div className="form-actions">
          {actions.canDelete && !showHeaderDiscard && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={formLocked || saving || completing || submitting || deleting}
              onClick={() => void runDeleteBill()}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
          <div className="page-header-spacer" />
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/bill/list")}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={formLocked || saving || completing || submitting || deleting || !lineItemsLoaded}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {form.is_draft && actions.canSubmitForReview && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmitForReview}
              disabled={formLocked || saving || completing || submitting || deleting || !lineItemsLoaded || !hasProjectOnLineItem}
              title={
                !hasProjectOnLineItem
                  ? SUBMIT_REQUIRES_PROJECT_MSG
                  : "Submit for review — drafts an email to the project PMs and advances the bill state."
              }
            >
              {submitting ? "Submitting..." : "Submit for Review"}
            </button>
          )}
          {form.is_draft && actions.canComplete && (
            <button
              type="button"
              className="btn btn-success"
              onClick={handleComplete}
              disabled={formLocked || saving || completing || submitting || deleting || !lineItemsLoaded}
            >
              {completing ? "Completing..." : "Complete Bill"}
            </button>
          )}
        </div>

        <CompletionStatusBar
          state={pollState}
          completeMessage="Bill completed — external syncs continue in the background."
          viewLabel="View Bill"
          onView={() => navigate(`/bill/${publicId}`)}
        />

      </form>

      {attachmentPublicId && (
        <div className="pdf-viewer">
          <div className="page-header" style={{ marginBottom: 8 }}>
            <h3 className="line-items-heading" style={{ margin: 0 }}>
              Attachment
            </h3>
            <div className="page-header-spacer" />
            {showRereadPdf && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={formLocked || saving || completing || submitting}
                onClick={() => void handleRereadPdf()}
              >
                {rereadingAttachment ? "Reading…" : "Re-read PDF"}
              </button>
            )}
          </div>
          {attachmentLoading && <p className="text-muted">Loading attachment…</p>}
          {attachmentLoadError && <p className="page-error">Could not load attachment.</p>}
          {attachmentBlobUrl && (
            <iframe src={`${attachmentBlobUrl}#view=FitH&navpanes=0`} title="Bill PDF" />
          )}
        </div>
      )}
    </div>
  );
}
