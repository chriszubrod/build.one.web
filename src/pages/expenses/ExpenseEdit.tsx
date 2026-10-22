import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState, useRef, type Dispatch, type SetStateAction } from "react";
import { useServerOwnedRebase } from "../../hooks/useServerOwnedRebase";
import { useSyncedToken } from "../../hooks/useSyncedToken";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, useEntityList, entityItemKey } from "../../hooks/useEntity";
import { useDeleteDocument } from "../../hooks/useDeleteDocument";
import { useViewAttachmentObjectUrl } from "../../hooks/useViewAttachmentObjectUrl";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useCompletionPolling } from "../../hooks/useCompletionPolling";
import { useToast } from "../../components/Toast";
import CompletionStatusBar from "../../components/CompletionStatusBar";
import { put, post, del, getList, getOne } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { resolveExpenseEditActions } from "./expensePermissions";
import DocumentHeaderFields from "../../components/DocumentHeaderFields";
import { expenseHeaderFields, vendorSelectOptions } from "./expenseHeaderFields";
import InlineLineItems, { type LineItemFieldDef } from "../../components/InlineLineItems";
import LineItemAttachment from "../../components/LineItemAttachment";
import ReviewTimeline from "../../components/ReviewTimeline";
import { expenseListPath } from "./expenseStatusTabs";
import { expenseStatus } from "./expenseLifecycle";
import RecordChangedBanner from "../../components/RecordChangedBanner";
import Breadcrumb from "../../components/Breadcrumb";
import type { Expense, ExpenseLineItem, Project, SubCostCode, Vendor as FullVendor } from "../../types/api";
import { existingUidsByPublicId, newLineItemUid, persistedLineItemUid } from "../../shared/lineItemUid";
import {
  applyLineEdits,
  billableHint,
  billablePayload,
  effectiveBillable,
} from "./billableDecision";
import {
  findReceiptAttachmentPublicId,
  getEliaLinkForLine,
  type EliaLink,
} from "./expenseReceipt";

interface LineItemRow {
  uid: string;
  public_id?: string;
  row_version?: string;
  description: string;
  sub_cost_code_id: string;
  project_id: string;
  quantity: string;
  rate: string;
  amount: string;
  is_billable: boolean;
  billable_decided: boolean;
  markup: string;
  price: string;
}

/** Header form state mirrored from Expense (stringly fields for inputs). */
interface ExpenseFormState {
  vendor_public_id: string;
  expense_date: string;
  reference_number: string;
  total_amount: string;
  memo: string;
  is_draft: boolean;
  is_credit: boolean;
  row_version: string;
  [key: string]: string | boolean;
}

function newLineItem(): LineItemRow {
  return {
    uid: newLineItemUid(),
    description: "", sub_cost_code_id: "", project_id: "",
    quantity: "", rate: "", amount: "", is_billable: true, billable_decided: false, markup: "", price: "",
  };
}

const ATTACHMENT_PRESERVE_ERROR =
  "Could not preserve this expense's receipt — nothing was saved and the line was not removed.";

/** Put removed persisted rows back in orig order; unsaved (no public_id) rows stay after them. */
function restoreRemovedLineItems(
  current: LineItemRow[],
  removedIds: string[],
  origOrder: string[],
  knownByPublicId: Map<string, LineItemRow>,
): LineItemRow[] {
  if (removedIds.length === 0) return current;

  const byId = new Map<string, LineItemRow>();
  for (const row of current) {
    if (row.public_id) byId.set(row.public_id, row);
  }
  for (const id of removedIds) {
    if (byId.has(id)) continue;
    const known = knownByPublicId.get(id);
    if (known) byId.set(id, known);
  }

  const persisted: LineItemRow[] = [];
  const placed = new Set<string>();
  for (const id of origOrder) {
    const row = byId.get(id);
    if (row) {
      persisted.push(row);
      placed.add(id);
    }
  }
  const rest = current.filter((r) => !r.public_id || !placed.has(r.public_id));
  return [...persisted, ...rest];
}

/**
 * U-476: an expense's receipt is linked to ONE line item, so removing that line
 * would cascade-delete the Attachment row and the Azure blob. Before any line
 * delete, re-home the link (create-before-delete) onto a surviving line.
 *
 * PLAN BEFORE MUTATING. Each line can hold a different receipt; gathering then
 * writing per removed line is not atomic. Pass 1 is read-only: load every
 * removed link, and every survivor link only when a removed line
 * actually carries a receipt (we return early otherwise). Receipts that need a new home are
 * those whose attachment is not already held by a survivor; if they outnumber
 * distinct link-free (404) survivors, throw ATTACHMENT_PRESERVE_ERROR before
 * any create or delete. Only a feasible plan executes, and each receipt is
 * assigned a DISTINCT free survivor (a slot consumed this save is never reused).
 *
 * Idempotent-create returns an existing row if the target already has a link,
 * so we only target a truly link-free (404) survivor and verify the returned
 * attachment_id.
 *
 * Pass 2 stages every create (and identity verification) before any ELIA
 * delete — including already-preserved old-link deletes. A throw during the
 * create phase therefore never drops an existing link. Residual: if create
 * N of M succeeds and a later create/verify fails, those earlier new links
 * remain (non-destructive duplicates). A throw mid-delete, after all creates
 * verified, can leave a mix of old and new links. saveAll still aborts
 * before the header PUT and line-item deletes; it restores removed rows so
 * the form is not left unsaveable.
 */
async function rehomeAttachmentsBeforeLineDeletes(
  removedIds: string[],
  survivingIds: string[],
): Promise<void> {
  if (removedIds.length === 0) return;

  // Pass 1 — read only. A missing link, or a link with no attachment_id (the
  // column is nullable), has nothing to preserve — never dereference
  // attachment_id blindly (would GET /id/null).
  const removedReceipts: { link: EliaLink; attachmentId: number }[] = [];
  for (const removedId of removedIds) {
    const link = await getEliaLinkForLine(removedId);
    if (!link?.attachment_id) continue;
    removedReceipts.push({ link, attachmentId: link.attachment_id });
  }
  if (removedReceipts.length === 0) return;

  // Scan EVERY survivor — no early exit once enough free slots are found. A 404
  // survivor is a free slot; a later survivor may ALREADY hold one of these
  // receipts (retry-safe), and only a full scan can know that.
  const heldBySurvivor = new Set<number>();
  const linkFreeSurvivors: string[] = [];
  for (const sid of survivingIds) {
    const sLink = await getEliaLinkForLine(sid);
    if (sLink === null) linkFreeSurvivors.push(sid);
    else if (sLink.attachment_id != null) heldBySurvivor.add(sLink.attachment_id);
  }

  const alreadyPreserved: EliaLink[] = [];
  const needHomeByAtt = new Map<number, EliaLink[]>();
  for (const { link, attachmentId } of removedReceipts) {
    if (heldBySurvivor.has(attachmentId)) {
      alreadyPreserved.push(link);
      continue;
    }
    const group = needHomeByAtt.get(attachmentId) ?? [];
    group.push(link);
    needHomeByAtt.set(attachmentId, group);
  }

  if (needHomeByAtt.size > linkFreeSurvivors.length) {
    throw new Error(ATTACHMENT_PRESERVE_ERROR);
  }

  // Pass 2, phase A — EVERY create and its identity verification runs before any
  // delete. Ordering is the whole point: a throw in this phase has issued no
  // delete at all, so ATTACHMENT_PRESERVE_ERROR's "nothing was saved" is true.
  // BillEdit.tsx's still-current shape (alreadyPreserved deletes first, then
  // create+delete per group; booked open at TODO.md:177) could commit a delete and THEN throw on a later group, telling the
  // user nothing happened while a receipt had permanently moved.
  const linksToDrop: EliaLink[] = [...alreadyPreserved];
  let nextSlot = 0;
  for (const [attachmentId, oldLinks] of needHomeByAtt) {
    // Unreachable given the feasibility check above (size <= linkFreeSurvivors
    // .length) and nextSlot < size; kept as a module-boundary backstop. A slot
    // consumed by one attachment is never reused.
    const target = linkFreeSurvivors[nextSlot++];
    if (!target) throw new Error(ATTACHMENT_PRESERVE_ERROR);

    const att = await getOne<{ public_id: string }>(`/api/v1/get/attachment/id/${attachmentId}`);
    const created = await post<EliaLink>("/api/v1/create/expense-line-item-attachment", {
      expense_line_item_public_id: target,
      attachment_public_id: att.public_id,
    });
    // Idempotent-create returns an existing row if target already had ANY link —
    // verify it is OUR attachment or we would silently drop the document below.
    if (created.attachment_id !== attachmentId) {
      throw new Error(ATTACHMENT_PRESERVE_ERROR);
    }
    linksToDrop.push(...oldLinks);
  }

  // Phase B — drop old links only once every receipt has a verified new home.
  // Residual, stated rather than hidden: if a delete here fails partway, the
  // earlier deletes stand. No receipt is lost (each already has a new home) and
  // a retry re-plans correctly from the new server state, but the message surfaced in that narrow
  // window is the raw delete failure, not ATTACHMENT_PRESERVE_ERROR.
  for (const link of linksToDrop) {
    await del(`/api/v1/delete/expense-line-item-attachment/${link.public_id}`);
  }
}

export default function ExpenseEdit() {
  const { publicId: id } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const expenseItemPath = `/api/v1/get/expense/${id}`;
  const { item, loading, error } = useEntityItem<Expense>(expenseItemPath);
  const { items: fullSubCostCodes } = useEntityList<SubCostCode>("/api/v1/get/sub-cost-codes");
  const { items: fullProjects } = useEntityList<Project>("/api/v1/get/projects");
  // Bumped after each line load so the default effect below re-runs with the CURRENT
  // project catalog — hydration captured whatever catalog existed when the fetch began.
  const [linesHydrated, setLinesHydrated] = useState(0);
  const projectBillableKey = useMemo(
    () => fullProjects.map((p) => `${p.id}:${p.is_cost_plus ?? ""}`).join("|"),
    [fullProjects],
  );
  const { items: fullVendors } = useEntityList<FullVendor>("/api/v1/get/vendors");
  const { data: lookups } = useLookups("vendors");
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const actions = resolveExpenseEditActions(me);
  const [form, setForm] = useState<ExpenseFormState | null>(null);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [origLineItemPublicIds, setOrigLineItemPublicIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null); // see saveAll
  const [completing, setCompleting] = useState(false);
  const [attachmentPublicId, setAttachmentPublicId] = useState<string | null>(null);
  const { objectUrl: attachmentBlobUrl, loading: attachmentLoading, loadError: attachmentLoadError } =
    useViewAttachmentObjectUrl(attachmentPublicId);
  const [saveError, setSaveError] = useState("");
  const { toast } = useToast();
  const rowVersion = useSyncedToken(form?.row_version);
  // U-476: a failed saveAll may have partially synced lines. false disarms
  // auto-save until an explicit Save succeeds, so the debounce cannot keep
  // firing header PUTs against a half-synced line set.
  const autoSaveArmedRef = useRef(true);
  const headerDirtyRef = useRef(false);
  const linesDirtyRef = useRef(false);
  const lineItemsRef = useRef<LineItemRow[]>([]);
  const formRef = useRef<ExpenseFormState | null>(null);
  // Last-seen persisted rows, including ones the user just removed from the DOM.
  const knownLineItemByPublicIdRef = useRef<Map<string, LineItemRow>>(new Map());
  for (const row of lineItems) {
    if (row.public_id) knownLineItemByPublicIdRef.current.set(row.public_id, row);
  }

  const { state: pollState, start: startPolling } = useCompletionPolling<Expense>(
    expenseItemPath,
    {
      isDone: (e) => e.is_draft === false,
      onComplete: (expense) => {
        queryClient.setQueryData(entityItemKey(expenseItemPath), expense);
        toast("Expense completed — external syncs continue in the background.");
        setForm((prev) => (prev ? { ...prev, is_draft: false } : prev));
        setCompleting(false);
      },
      onError: () => setCompleting(false),
    },
  );

  const itemId = item?.id ?? null;
  useEffect(() => {
    if (itemId === null) return;
    let cancelled = false;
    setAttachmentPublicId(null);
    getList<ExpenseLineItem>(`/api/v1/get/expense_line_items/expense/${itemId}`)
      .then(async (res) => {
        if (cancelled) return;
        setOrigLineItemPublicIds(res.data.map((li) => li.public_id));
        linesDirtyRef.current = false;
        setLineItems((prev) => {
          const existing = existingUidsByPublicId(prev);
          const next = res.data.map((li) => {
            const project_id = li.project_id != null ? String(li.project_id) : "";
            const billable_decided = li.billable_decided_at != null;
            const rowSoFar: LineItemRow = {
              uid: existing.get(li.public_id) ?? persistedLineItemUid(li.public_id),
              public_id: li.public_id,
              row_version: li.row_version,
              description: li.description ?? "",
              sub_cost_code_id: li.sub_cost_code_id != null ? String(li.sub_cost_code_id) : "",
              project_id,
              quantity: li.quantity != null ? String(li.quantity) : "",
              rate: li.rate ?? "",
              amount: li.amount ?? "",
              is_billable: li.is_billable ?? true,
              billable_decided,
              markup: li.markup ?? "",
              price: li.price ?? "",
            };
            const project = fullProjects.find((p) => String(p.id) === project_id);
            return {
              ...rowSoFar,
              is_billable: effectiveBillable(rowSoFar, project),
            };
          });
          lineItemsRef.current = next;
          return next;
        });
        setLinesHydrated((n) => n + 1);

        const publicId = await findReceiptAttachmentPublicId(res.data, () => cancelled);
        if (publicId && !cancelled) setAttachmentPublicId(publicId);
      })
      .catch(() => {
        if (!cancelled) setAttachmentPublicId(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fullProjects at fetch time; projectBillableKey effect covers late catalog
  }, [itemId]);

  // When the project catalog arrives or cost-plus flags change, refresh undecided checkboxes.
  useEffect(() => {
    if (!projectBillableKey) return;
    setLineItems((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((row) => {
        if (row.billable_decided) return row;
        const project = fullProjects.find((p) => String(p.id) === row.project_id);
        const is_billable = effectiveBillable(row, project);
        if (is_billable === row.is_billable) return row;
        changed = true;
        return { ...row, is_billable };
      });
      return changed ? next : prev;
    });
    // fullProjects is read when projectBillableKey changes (stable catalog snapshot).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fullProjects read when projectBillableKey changes
  }, [projectBillableKey, linesHydrated]);

  // Init header form
  // U-465: which expense `form` was seeded from. The rebase below refuses a
  // value from a different one — see useServerOwnedRebase for why.
  const seededForRef = useRef<string | null>(null);

  // ONE projection for the seed, the baseline, and the divergence test.
  // A separate seed literal and pick literal is how U-464/U-465 were
  // allowed to rebase a token under a body they had never compared.
  const seedFrom = (e: Expense): ExpenseFormState => ({
    vendor_public_id: fullVendors.find((v) => v.id === e.vendor_id)?.public_id ?? "",
    expense_date: e.expense_date,
    reference_number: e.reference_number,
    total_amount: e.total_amount ?? "",
    memo: e.memo ?? "",
    is_draft: e.is_draft,
    is_credit: e.is_credit,
    row_version: e.row_version,
  });

  // U-471: rebase the write token only when the freshly-arrived record
  // differs from the last-in-sync baseline solely in server-owned fields.
  // A review transition still rebases; a co-editor's memo change does not.
  // owned is exactly {row_version, is_draft}; a bound input here is a
  // lost-update bug. The same-entity guard lives in the hook.
  const { diverged, acceptBaseline } = useServerOwnedRebase({
    item,
    seededFor: seededForRef,
    setForm: setForm as Dispatch<SetStateAction<Record<string, unknown> | null>>,
    seedFrom: seedFrom as (e: Expense) => Record<string, unknown>,
    owned: ["row_version", "is_draft"],
  });

  if (item && !form && fullVendors.length > 0) {
    seededForRef.current = item.public_id;
    acceptBaseline(item);
    setForm(seedFrom(item));
  }

  formRef.current = form;
  lineItemsRef.current = lineItems;

  const headerPutBody = (f: ExpenseFormState) => ({
    row_version: rowVersion.read(),
    vendor_public_id: f.vendor_public_id || undefined,
    expense_date: f.expense_date,
    reference_number: f.reference_number,
    total_amount: f.total_amount !== "" ? Number(f.total_amount) : null,
    memo: f.memo || null,
    is_draft: f.is_draft,
    is_credit: f.is_credit,
  });

  // Auto-save header on changes (300ms debounce)
  const autoSaveHeader = useCallback(async () => {
    const f = formRef.current;
    if (!f || !id) return;
    if (!headerDirtyRef.current) return;
    headerDirtyRef.current = false;
    try {
      const updated = await put<Expense>(`/api/v1/update/expense/${id}`, headerPutBody(f));
      rowVersion.set(updated.row_version);
      acceptBaseline(updated);
      setForm((prev) => (prev ? { ...prev, row_version: updated.row_version } : prev));
    } catch {
      headerDirtyRef.current = true;
    }
    // headerPutBody + formRef: latest header snapshot without listing form in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, rowVersion, acceptBaseline]);

  const { flush: flushAutoSave, cancel: cancelAutoSave } = useAutoSave(
    autoSaveHeader,
    [form?.vendor_public_id, form?.expense_date, form?.reference_number, form?.total_amount, form?.memo, form?.is_credit],
    300,
    !!form && !!item && form.is_draft && !completing && actions.canEdit && autoSaveArmedRef.current,
  );

  useEffect(() => {
    if (!actions.canEdit) cancelAutoSave();
  }, [actions.canEdit, cancelAutoSave]);

  const listPath = expenseListPath(item ? expenseStatus(item) : null);
  const { deleting, runDelete: runDeleteExpense } = useDeleteDocument({
    deletePath: id ? `/api/v1/delete/expense/${id}` : "",
    confirmText: "Delete this expense? This cannot be undone.",
    successToast: "Expense deleted.",
    errorFallback: "Could not delete expense.",
    navigateTo: listPath,
    beforeDelete: cancelAutoSave,
    removeQueryKeys: id ? [entityItemKey(expenseItemPath)] : [],
  });

  const projectFor = useCallback(
    (projectId: string) => fullProjects.find((p) => String(p.id) === projectId),
    [fullProjects],
  );

  const handleLineItemsChange = useCallback(
    (next: LineItemRow[]) => {
      linesDirtyRef.current = true;
      setLineItems((prev) => {
        const merged = applyLineEdits(prev, next, projectFor);
        lineItemsRef.current = merged;
        return merged;
      });
    },
    [projectFor],
  );

  const lineItemFields = useMemo<LineItemFieldDef<LineItemRow>[]>(() => {
    const sccOptions = fullSubCostCodes.map((s) => ({
      value: String(s.id),
      label: s.number ? `${s.number} — ${s.name}` : s.name,
    }));
    const projectOptions = fullProjects.map((p) => ({ value: String(p.id), label: p.name }));
    return [
      { key: "description", label: "Description", width: "200px" },
      {
        key: "sub_cost_code_id",
        label: "Sub Cost Code",
        width: "140px",
        type: "select",
        options: sccOptions,
      },
      {
        key: "project_id",
        label: "Project",
        width: "120px",
        type: "select",
        options: projectOptions,
      },
      { key: "quantity", label: "Qty", width: "70px", type: "number", align: "right" },
      { key: "rate", label: "Rate", width: "90px", type: "number", align: "right" },
      { key: "amount", label: "Amount", width: "100px", type: "number", align: "right" },
      { key: "markup", label: "Markup", width: "80px", type: "number", align: "right", placeholder: "0.10" },
      { key: "price", label: "Price", width: "100px", type: "number", align: "right" },
      {
        key: "is_billable",
        label: "Billable",
        width: "60px",
        type: "checkbox",
        hint: (row) => billableHint(row, projectFor(row.project_id)),
      },
    ];
  }, [fullSubCostCodes, fullProjects, projectFor]);

  const headerFields = expenseHeaderFields(vendorSelectOptions(lookups.vendors), "edit");

  if (loading || meLoading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  if (!actions.canEdit) {
    return (
      <div className="page">
        <div className="page-error">You don&apos;t have permission to edit this expense.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/expense/${id}`)}>
          Back to Expense
        </button>
      </div>
    );
  }

  const onHeaderChange = (name: string, value: string | boolean) => {
    headerDirtyRef.current = true;
    setForm((prev) => (prev ? { ...prev, [name]: value } : prev));
  };

  // One save at a time. A second caller (e.g. Submit for Review clicked while Save is
  // still writing) JOINS the save in flight instead of starting another: saveAllOnce
  // is a render closure, so a queued second run would replay stale row_versions and
  // 409 (U-647 round 2).
  const saveAll = (): Promise<boolean> => {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    const p = saveAllOnce().finally(() => {
      saveInFlightRef.current = null;
    });
    saveInFlightRef.current = p;
    return p;
  };

  const saveAllOnce = async (): Promise<boolean> => {
    setSaving(true);
    setSaveError("");
    let linesNeedSync = false;
    try {
      await flushAutoSave();
      cancelAutoSave();

      const syncedLines = lineItemsRef.current;
      const survivingIds = syncedLines.filter((li) => li.public_id).map((li) => li.public_id!);
      const currentIds = new Set(survivingIds);
      const removedIds = origLineItemPublicIds.filter((oid) => !currentIds.has(oid));
      const hasUnsavedLines = syncedLines.some((li) => !li.public_id);
      linesNeedSync = linesDirtyRef.current || removedIds.length > 0 || hasUnsavedLines;

      if (!headerDirtyRef.current && !linesNeedSync) return true;
      // U-476: re-home the receipt BEFORE the header PUT and any line delete —
      // create-before-delete. If re-home throws, restore removed rows so the
      // message "the line was not removed" is true and the form stays saveable.
      try {
        await rehomeAttachmentsBeforeLineDeletes(removedIds, survivingIds);
      } catch (err) {
        setLineItems((prev) =>
          restoreRemovedLineItems(
            prev,
            removedIds,
            origLineItemPublicIds,
            knownLineItemByPublicIdRef.current,
          ),
        );
        throw err;
      }

      if (headerDirtyRef.current) {
        const latest = formRef.current!;
        headerDirtyRef.current = false;
        let updated: Expense;
        try {
          updated = await put<Expense>(`/api/v1/update/expense/${id}`, headerPutBody(latest));
        } catch (err) {
          headerDirtyRef.current = true;
          throw err;
        }
        rowVersion.set(updated.row_version);
        acceptBaseline(updated);
        setForm((prev) => (prev ? { ...prev, row_version: updated.row_version } : prev));
      }

      if (!linesNeedSync) {
        autoSaveArmedRef.current = true;
        return true;
      }

      // Line-item sync (U-170). Each confirmed fact is committed through a
      // functional updater the instant it lands — never accumulated and written
      // back after the loop. A retry must not re-DELETE a gone row or re-CREATE
      // a row whose public_id already landed.
      for (const origId of removedIds) {
        await del(`/api/v1/delete/expense_line_item/${origId}`);
        setOrigLineItemPublicIds((prev) => prev.filter((oid) => oid !== origId));
      }

      const stampRow = (uid: string, patch: Partial<LineItemRow>) =>
        setLineItems((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

      const linesToSync = lineItemsRef.current;
      linesDirtyRef.current = false;

      for (const li of linesToSync) {
        const bodyBase = {
          expense_public_id: id!,
          sub_cost_code_id: li.sub_cost_code_id !== "" ? Number(li.sub_cost_code_id) : null,
          project_public_id:
            fullProjects.find((p) => String(p.id) === li.project_id)?.public_id ?? null,
          description: li.description || null,
          quantity: li.quantity !== "" ? Number(li.quantity) : null,
          rate: li.rate !== "" ? Number(li.rate) : null,
          amount: li.amount !== "" ? Number(li.amount) : null,
          markup: li.markup !== "" ? Number(li.markup) : null,
          price: li.price !== "" ? Number(li.price) : null,
        };

        if (li.public_id) {
          const result = await put<ExpenseLineItem>(`/api/v1/update/expense_line_item/${li.public_id}`, {
            ...bodyBase,
            ...billablePayload(li),
            row_version: li.row_version!,
          });
          stampRow(li.uid, { row_version: result.row_version });
        } else {
          // Create route never stamps billable_decided; send the displayed checkbox value.
          const result = await post<ExpenseLineItem>("/api/v1/create/expense_line_item", {
            ...bodyBase,
            is_billable: li.is_billable,
          });
          stampRow(li.uid, { public_id: result.public_id, row_version: result.row_version });
          setOrigLineItemPublicIds((prev) =>
            prev.includes(result.public_id) ? prev : [...prev, result.public_id],
          );
          // The create route cannot stamp a decision, and Save navigates away, so a
          // person's choice on a NEW line would be lost (reloads as undecided). Record
          // it now through the update route. If this fails the row already has its
          // public_id and keeps billable_decided, so the next save retries it.
          if (li.billable_decided) {
            const stamped = await put<ExpenseLineItem>(
              `/api/v1/update/expense_line_item/${result.public_id}`,
              { ...bodyBase, ...billablePayload(li), row_version: result.row_version },
            );
            stampRow(li.uid, { row_version: stamped.row_version });
          }
        }
      }
      autoSaveArmedRef.current = true;
      return true;
    } catch (err: unknown) {
      autoSaveArmedRef.current = false;
      if (linesNeedSync) linesDirtyRef.current = true;
      cancelAutoSave();
      setSaveError(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await saveAll()) {
      navigate(`/expense/${id}`);
    }
  };

  const handleComplete = async () => {
    if (!confirm("Complete this expense? This will finalize and sync to external systems.")) return;
    const saved = await saveAll();
    if (!saved) return;
    setCompleting(true);
    cancelAutoSave();
    setSaveError("");
    try {
      await post(`/api/v1/complete/expense/${id}`, {});
      startPolling();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Complete failed.");
      setCompleting(false);
    }
  };

  return (
    <div className="page form-page-wide">
      <Breadcrumb
        crumbs={[
          { label: "Expenses", path: listPath },
          { label: item?.reference_number || "…", path: `/expense/${id}` },
          { label: "Edit" },
        ]}
      />
      <div className="page-header"><h1>Edit Expense {item?.reference_number}</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {/* Frozen while a save is writing: every caller that joins the in-flight save
            (saveAll) must get a result that includes everything on screen, so nothing
            may change underneath it (U-647 round 3). */}
        <fieldset disabled={saving} className="form-fieldset-reset" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {diverged && <RecordChangedBanner entity="expense" />}
        {saveError && <div className="form-error">{saveError}</div>}

        {id && (
          <ReviewTimeline
            parentType="expense"
            parentPublicId={id}
            onBeforeAction={saveAll}
          />
        )}

        <DocumentHeaderFields fields={headerFields} values={form} onChange={onHeaderChange} />

        <InlineLineItems
          fields={lineItemFields}
          items={lineItems}
          onChange={handleLineItemsChange}
          newItem={newLineItem}
          extraColumn={{
            label: "Attachment",
            width: "130px",
            render: (item) =>
              item.public_id ? (
                <LineItemAttachment lineItemPublicId={item.public_id} entityType="expense" />
              ) : (
                <span className="text-muted" style={{ fontSize: 11 }}>Save first</span>
              ),
          }}
        />

        <div className="form-actions">
          {actions.canDelete && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={saving || completing || deleting}
              onClick={() => void runDeleteExpense()}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          )}
          <div className="page-header-spacer" />
          <button type="submit" className="btn btn-primary" disabled={saving || completing || deleting}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/expense/${id}`)}>Cancel</button>
        </div>

        {form.is_draft && actions.canComplete && (
          <div className="complete-bar">
            <button
              type="button"
              className="btn btn-success"
              onClick={handleComplete}
              disabled={saving || completing || deleting}
            >
              {completing ? "Completing..." : "Complete Expense"}
            </button>
            <span className="text-muted" style={{ fontSize: 13 }}>
              Finalizes the expense and syncs to SharePoint and Excel.
            </span>
          </div>
        )}

        <CompletionStatusBar
          state={pollState}
          completeMessage="Expense completed — external syncs continue in the background."
          viewLabel="View Expense"
          onView={() => navigate(`/expense/${id}`)}
        />
        </fieldset>
      </form>

      {attachmentPublicId && (
        <div className="pdf-viewer">
          <h3 className="line-items-heading">Attachment</h3>
          {attachmentLoading && <p className="text-muted">Loading attachment…</p>}
          {attachmentLoadError && <p className="page-error">Could not load attachment.</p>}
          {attachmentBlobUrl && (
            <iframe src={`${attachmentBlobUrl}#view=FitH&navpanes=0`} title="Expense PDF" />
          )}
        </div>
      )}
    </div>
  );
}
