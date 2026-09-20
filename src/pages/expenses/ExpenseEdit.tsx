import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useServerOwnedRebase } from "../../hooks/useServerOwnedRebase";
import { useSyncedToken } from "../../hooks/useSyncedToken";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, useEntityList, deleteEntity, entityItemKey } from "../../hooks/useEntity";
import { useViewAttachmentObjectUrl } from "../../hooks/useViewAttachmentObjectUrl";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useCompletionPolling } from "../../hooks/useCompletionPolling";
import { useToast } from "../../components/Toast";
import CompletionStatusBar from "../../components/CompletionStatusBar";
import { put, post, del, getList, getOne, ApiError } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { resolveExpenseEditActions } from "./expensePermissions";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import InlineLineItems, { type LineItemFieldDef } from "../../components/InlineLineItems";
import LineItemAttachment from "../../components/LineItemAttachment";
import ReviewTimeline from "../../components/ReviewTimeline";
import RecordChangedBanner from "../../components/RecordChangedBanner";
import Breadcrumb from "../../components/Breadcrumb";
import type { Expense, ExpenseLineItem, Project, SubCostCode, Vendor as FullVendor } from "../../types/api";
import { existingUidsByPublicId, newLineItemUid, persistedLineItemUid } from "../../shared/lineItemUid";

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
  markup: string;
  price: string;
}

function newLineItem(): LineItemRow {
  return {
    uid: newLineItemUid(),
    description: "", sub_cost_code_id: "", project_id: "",
    quantity: "", rate: "", amount: "", is_billable: true, markup: "", price: "",
  };
}

interface EliaLink {
  public_id: string;
  attachment_id: number | null;
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

/** U-476: null only on a definitive 404 (the line has no link); other errors propagate. */
async function getEliaLinkForLine(lineItemPublicId: string): Promise<EliaLink | null> {
  try {
    return await getOne<EliaLink>(
      `/api/v1/get/expense-line-item-attachment/by-expense-line-item/${lineItemPublicId}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
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
  const { items: fullVendors } = useEntityList<FullVendor>("/api/v1/get/vendors");
  const { data: lookups } = useLookups("vendors");
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const actions = resolveExpenseEditActions(me);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [origLineItemPublicIds, setOrigLineItemPublicIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
        setForm((prev: any) => (prev ? { ...prev, is_draft: false } : prev));
        setCompleting(false);
      },
      onError: () => setCompleting(false),
    },
  );

  // Load line items
  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    getList<ExpenseLineItem>(`/api/v1/get/expense_line_items/expense/${item.id}`)
      .then(async (res) => {
        if (cancelled) return;
        setOrigLineItemPublicIds(res.data.map((li) => li.public_id));
        setAttachmentPublicId(null);
        setLineItems((prev) => {
          const existing = existingUidsByPublicId(prev);
          return res.data.map((li) => ({
            uid: existing.get(li.public_id) ?? persistedLineItemUid(li.public_id),
            public_id: li.public_id,
            row_version: li.row_version,
            description: li.description ?? "",
            sub_cost_code_id: li.sub_cost_code_id != null ? String(li.sub_cost_code_id) : "",
            project_id: li.project_id != null ? String(li.project_id) : "",
            quantity: li.quantity != null ? String(li.quantity) : "",
            rate: li.rate ?? "",
            amount: li.amount ?? "",
            is_billable: li.is_billable ?? true,
            markup: li.markup ?? "",
            price: li.price ?? "",
          }));
        });

        for (const li of res.data) {
          if (cancelled) return;
          try {
            const link = await getEliaLinkForLine(li.public_id);
            if (cancelled || !link?.attachment_id) continue;
            const att = await getOne<{ public_id: string }>(
              `/api/v1/get/attachment/id/${link.attachment_id}`,
            );
            if (cancelled) return;
            setAttachmentPublicId(att.public_id);
            break;
          } catch {
            // display-only — try the next line
          }
        }
      })
      .catch(() => {
        if (!cancelled) setAttachmentPublicId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item]);

  // Init header form
  // U-465: which expense `form` was seeded from. The rebase below refuses a
  // value from a different one — see useServerOwnedRebase for why.
  const seededForRef = useRef<string | null>(null);

  // ONE projection for the seed, the baseline, and the divergence test.
  // A separate seed literal and pick literal is how U-464/U-465 were
  // allowed to rebase a token under a body they had never compared.
  const seedFrom = (e: Expense) => ({
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
    setForm,
    seedFrom,
    owned: ["row_version", "is_draft"],
  });

  if (item && !form && fullVendors.length > 0) {
    seededForRef.current = item.public_id;
    acceptBaseline(item);
    setForm(seedFrom(item));
  }

  // Auto-save header on changes (300ms debounce)
  const autoSaveHeader = useCallback(async () => {
    if (!form || !id) return;
    try {
      const updated = await put<Expense>(`/api/v1/update/expense/${id}`, {
        row_version: rowVersion.read(),
        vendor_public_id: form.vendor_public_id || undefined,
        expense_date: form.expense_date,
        reference_number: form.reference_number,
        total_amount: form.total_amount !== "" ? Number(form.total_amount) : null,
        memo: form.memo || null,
        is_draft: form.is_draft,
        is_credit: form.is_credit,
      });
      rowVersion.set(updated.row_version);
      acceptBaseline(updated);
      setForm((prev: any) => prev ? { ...prev, row_version: updated.row_version } : prev);
    } catch {
      // Silent fail for auto-save
    }
  }, [form, id, rowVersion, acceptBaseline]);

  const { flush: flushAutoSave, cancel: cancelAutoSave } = useAutoSave(
    autoSaveHeader,
    [form?.vendor_public_id, form?.expense_date, form?.reference_number, form?.total_amount, form?.memo, form?.is_credit],
    300,
    !!form && !!item && form.is_draft && !completing && actions.canEdit && autoSaveArmedRef.current,
  );

  useEffect(() => {
    if (!actions.canEdit) cancelAutoSave();
  }, [actions.canEdit, cancelAutoSave]);

  const lineItemFields = useMemo<LineItemFieldDef[]>(() => {
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
      { key: "is_billable", label: "Billable", width: "60px", type: "checkbox" },
    ];
  }, [fullSubCostCodes, fullProjects]);

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

  const onChange = (name: string, value: string) => setForm((prev: any) => ({ ...prev, [name]: value }));

  const saveAll = async () => {
    // Cancel before any await so a 300ms header debounce cannot fire a second
    // PUT with the same row_version while re-home GETs are in flight.
    cancelAutoSave();
    setSaving(true);
    setSaveError("");
    try {
      // U-476: re-home the receipt BEFORE the header PUT and any line delete —
      // create-before-delete. If re-home throws, restore removed rows so the
      // message "the line was not removed" is true and the form stays saveable.
      const survivingIds = lineItems.filter((li) => li.public_id).map((li) => li.public_id!);
      const currentIds = new Set(survivingIds);
      const removedIds = origLineItemPublicIds.filter((oid) => !currentIds.has(oid));
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

      // Save header
      const updated = await put<Expense>(`/api/v1/update/expense/${id}`, {
        row_version: rowVersion.read(),
        vendor_public_id: form.vendor_public_id || undefined,
        expense_date: form.expense_date,
        reference_number: form.reference_number,
        total_amount: form.total_amount !== "" ? Number(form.total_amount) : null,
        memo: form.memo || null,
        is_draft: form.is_draft,
        is_credit: form.is_credit,
      });
      rowVersion.set(updated.row_version);
      acceptBaseline(updated);
      setForm((prev: any) => ({ ...prev, row_version: updated.row_version }));

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

      for (const li of lineItems) {
        const body = {
          expense_public_id: id!,
          sub_cost_code_id: li.sub_cost_code_id !== "" ? Number(li.sub_cost_code_id) : null,
          project_public_id:
            fullProjects.find((p) => String(p.id) === li.project_id)?.public_id ?? null,
          description: li.description || null,
          quantity: li.quantity !== "" ? Number(li.quantity) : null,
          rate: li.rate !== "" ? Number(li.rate) : null,
          amount: li.amount !== "" ? Number(li.amount) : null,
          is_billable: li.is_billable,
          markup: li.markup !== "" ? Number(li.markup) : null,
          price: li.price !== "" ? Number(li.price) : null,
        };

        if (li.public_id) {
          const result = await put<ExpenseLineItem>(`/api/v1/update/expense_line_item/${li.public_id}`, {
            ...body,
            row_version: li.row_version!,
          });
          stampRow(li.uid, { row_version: result.row_version });
        } else {
          const result = await post<ExpenseLineItem>("/api/v1/create/expense_line_item", body);
          stampRow(li.uid, { public_id: result.public_id, row_version: result.row_version });
          setOrigLineItemPublicIds((prev) =>
            prev.includes(result.public_id) ? prev : [...prev, result.public_id],
          );
        }
      }
      autoSaveArmedRef.current = true;
      return true;
    } catch (err: any) {
      autoSaveArmedRef.current = false;
      cancelAutoSave();
      setSaveError(err.message);
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
    await flushAutoSave();
    const saved = await saveAll();
    if (!saved) return;
    setCompleting(true);
    cancelAutoSave();
    setSaveError("");
    try {
      await post(`/api/v1/complete/expense/${id}`, {});
      startPolling();
    } catch (err: any) {
      setSaveError(err.message);
      setCompleting(false);
    }
  };

  return (
    <div className="page form-page-wide">
      <Breadcrumb
        crumbs={[
          { label: "Expenses", path: "/expense/list" },
          { label: item?.reference_number || "…", path: `/expense/${id}` },
          { label: "Edit" },
        ]}
      />
      <div className="page-header"><h1>Edit Expense {item?.reference_number}</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {diverged && <RecordChangedBanner entity="expense" />}
        {saveError && <div className="form-error">{saveError}</div>}

        {id && (
          <ReviewTimeline
            parentType="expense"
            parentPublicId={id}
            onBeforeAction={saveAll}
          />
        )}

        <div className="form-header-grid">
          <SelectField
            label="Vendor"
            name="vendor_public_id"
            value={form.vendor_public_id}
            onChange={onChange}
            options={(lookups.vendors ?? []).map((v) => ({ value: v.public_id, label: v.name }))}
          />
          <DateField label="Expense Date" name="expense_date" value={form.expense_date} onChange={onChange} required />
          <FormField label="Reference Number" name="reference_number" value={form.reference_number} onChange={onChange} required />
          <FormField label="Total Amount" name="total_amount" value={form.total_amount} onChange={onChange} type="number" />
          <div className="full-width">
            <TextareaField label="Memo" name="memo" value={form.memo} onChange={onChange} />
          </div>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={form.is_credit}
                onChange={(e) => setForm((prev: any) => ({ ...prev, is_credit: e.target.checked }))}
              />
              {" "}Is Credit
            </label>
          </div>
        </div>

        <InlineLineItems
          fields={lineItemFields}
          items={lineItems}
          onChange={setLineItems}
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
              onClick={async () => {
                if (!confirm("Delete this expense? This cannot be undone.")) return;
                cancelAutoSave();
                setDeleting(true);
                try {
                  await deleteEntity(`/api/v1/delete/expense/${id}`);
                  queryClient.removeQueries({ queryKey: entityItemKey(expenseItemPath) });
                  toast("Expense deleted.");
                  navigate("/expense/list");
                } catch (err: any) {
                  toast(err.message, "error");
                  setDeleting(false);
                }
              }}
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
