import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, entityItemKey } from "../../hooks/useEntity";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useSyncedToken } from "../../hooks/useSyncedToken";
import { useToast } from "../../components/Toast";
import { put, post, del, getList, getOne, ApiError } from "../../api/client";
import { useCompletionPolling } from "../../hooks/useCompletionPolling";
import CompletionStatusBar from "../../components/CompletionStatusBar";
import { useViewAttachmentObjectUrl } from "../../hooks/useViewAttachmentObjectUrl";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { resolveBillEditActions } from "./billPermissions";
import { useEntityList } from "../../hooks/useEntity";
import type { Vendor as FullVendor, SubCostCode, Project } from "../../types/api";
import { computeBillLine, sumLineAmounts } from "./lineMath";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import LineItemAttachment from "../../components/LineItemAttachment";
import ReviewTimeline from "../../components/ReviewTimeline";
import Breadcrumb from "../../components/Breadcrumb";
import type { Bill, BillLineItem } from "../../types/api";

interface LineItemRow {
  /** Stable client-side row identity, minted on load and on Add Row. saveAll stamps
   * server-confirmed facts back by uid, never by array index: Save does not disable
   * "+ Add Row" / remove, so a mid-loop remove shifts indices and an index-keyed
   * stamp would write one row's public_id onto a different row. Also the React key,
   * so a row does not remount (losing focus) the moment its public_id arrives.
   * TimeEntryView.tsx has the same convention — extract it if a third page needs it. */
  uid: string;
  public_id?: string;
  row_version?: string;
  description: string;
  sub_cost_code_id: string;
  project_public_id: string;
  /** Set when the stored line references a project outside this actor's UserProject
   * scope, so it is absent from /get/projects. project_public_id stays '' (we have no
   * public_id for it), and this field is what distinguishes 'cannot render it' from
   * 'user cleared it'. */
  unresolved_project_id?: number;
  quantity: string;
  rate: string;
  amount: string;
  is_billable: boolean;
  markup: string;
  price: string;
}

/** Display-only <select> value — never written to project_public_id or request bodies. */
const UNRESOLVED_PROJECT_VALUE = "__unresolved_project__";

function fmtMoney(v: string): string {
  if (!v) return "";
  const n = Number(v);
  if (isNaN(n)) return v;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
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
  const { data: lookups } = useLookups("vendors,payment_terms,sub_cost_codes,projects");
  const { items: fullVendors } = useEntityList<FullVendor>("/api/v1/get/vendors");
  const { items: fullPaymentTerms } = useEntityList<{ id: number; public_id: string }>("/api/v1/get/payment-terms");
  const { items: fullSubCostCodes } = useEntityList<SubCostCode>("/api/v1/get/sub-cost-codes");
  const { items: fullProjects } = useEntityList<Project>("/api/v1/get/projects");
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const actions = resolveBillEditActions(me);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [lineItemsLoaded, setLineItemsLoaded] = useState(false);
  const persistedLineTotalRef = useRef<number | null>(null);
  const headerDirtyRef = useRef(false);
  // Counts confirmed header PUTs (auto-save and saveAll) so saveAll can tell whether its
  // own header write is still the newest one before seeding the item cache.
  const headerWriteSeqRef = useRef(0);
  const [origLineItemPublicIds, setOrigLineItemPublicIds] = useState<string[]>([]);
  const [attachmentPublicId, setAttachmentPublicId] = useState<string | null>(null);
  const { objectUrl: attachmentBlobUrl, loading: attachmentLoading, loadError: attachmentLoadError } =
    useViewAttachmentObjectUrl(attachmentPublicId);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { state: pollState, start: startPolling } = useCompletionPolling<Bill>(
    billItemPath,
    {
      isDone: (b) => b.is_draft === false,
      onComplete: (bill) => {
        queryClient.setQueryData(entityItemKey(billItemPath), bill);
        toast("Bill completed — external syncs continue in the background.");
        setForm((prev) => (prev ? { ...prev, is_draft: false } : prev));
        setCompleting(false);
      },
      onError: () => setCompleting(false),
    },
  );

  // Load line items
  useEffect(() => {
    if (!item || fullProjects.length === 0) return;
    let cancelled = false;
    getList<BillLineItem>(`/api/v1/get/bill_line_items/bill/${item.id}`)
      .then(async (res) => {
        if (cancelled) return;
        setOrigLineItemPublicIds(res.data.map((li) => li.public_id));
        setAttachmentPublicId(null);
        setLineItems(res.data.map((li) => {
          const project = fullProjects.find((p) => p.id === li.project_id) ?? null;
          // A stored project absent from the scoped list keeps its numeric id here so a
          // save cannot mistake "cannot render it" for "user cleared it".
          const unresolvedProjectId = project ? undefined : (li.project_id ?? undefined);
          return computeLineItem({
            uid: newLineUid(),
            public_id: li.public_id,
            row_version: li.row_version,
            description: li.description ?? "",
            sub_cost_code_id: li.sub_cost_code_id != null ? String(li.sub_cost_code_id) : "",
            project_public_id: project?.public_id ?? "",
            unresolved_project_id: unresolvedProjectId,
            quantity: li.quantity != null ? String(li.quantity) : "",
            rate: li.rate ?? "",
            amount: li.amount ?? "",
            is_billable: li.is_billable ?? true,
            markup: li.markup ?? "",
            price: li.price ?? "",
          });
        }));
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
  }, [item, fullProjects]);

  // Init header form
  if (item && !form && fullVendors.length > 0 && fullPaymentTerms.length > 0) {
    const vendor = fullVendors.find((v) => v.id === item.vendor_id);
    const paymentTerm = fullPaymentTerms.find((pt) => pt.id === item.payment_term_id);
    setForm({
      vendor_public_id: vendor?.public_id ?? "",
      payment_term_public_id: paymentTerm?.public_id ?? "",
      bill_date: item.bill_date,
      due_date: item.due_date,
      bill_number: item.bill_number,
      total_amount: item.total_amount ?? "",
      memo: item.memo ?? "",
      is_draft: item.is_draft,
      row_version: item.row_version,
    });
  }


  const rowVersion = useSyncedToken(form?.row_version);

  // Auto-save header on changes (300ms debounce)
  const autoSaveHeader = useCallback(async () => {
    if (!form || !publicId) return;
    // flush() ignores the enabled gate — must not PUT until line items have loaded.
    if (persistedLineTotalRef.current == null) return;
    if (!headerDirtyRef.current) return;
    headerDirtyRef.current = false;
    try {
      // Auto-save sends the last-PERSISTED line total so the server total always
      // matches server lines; live UI sums only go up with explicit saveAll.
      const updated = await put<Bill>(`/api/v1/update/bill/${publicId}`, {
        row_version: rowVersion.read(),
        vendor_public_id: form.vendor_public_id || undefined,
        payment_term_public_id: form.payment_term_public_id || undefined,
        bill_date: form.bill_date,
        due_date: form.due_date,
        bill_number: form.bill_number,
        total_amount: persistedLineTotalRef.current,
        memo: form.memo || null,
        is_draft: form.is_draft,
      });
      rowVersion.set(updated.row_version);
      ++headerWriteSeqRef.current;
      setForm((prev: any) => (prev ? { ...prev, row_version: updated.row_version } : prev));
    } catch {
      headerDirtyRef.current = true;
      // Silent fail for auto-save — stale-token loop is prevented by useSyncedToken;
      // manual Save / Complete / Submit-for-Review still surface errors via saveAll.
    }
  }, [form, publicId, rowVersion]);

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
    !!form && !!item && lineItemsLoaded && form.is_draft && !completing && actions.canEdit,
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

  const saveAll = async () => {
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
      const survivingIds = lineItems.filter((li) => li.public_id).map((li) => li.public_id!);
      const currentIds = new Set(survivingIds);
      const removedIds = origLineItemPublicIds.filter((id) => !currentIds.has(id));
      await rehomeAttachmentsBeforeLineDeletes(removedIds, survivingIds);

      // Save header — total_amount computed from line items
      const computedTotal = sumLineAmounts(lineItems);
      const updated = await put<Bill>(`/api/v1/update/bill/${publicId}`, {
        row_version: rowVersion.read(),
        vendor_public_id: latestForm.vendor_public_id || undefined,
        payment_term_public_id: latestForm.payment_term_public_id || undefined,
        bill_date: latestForm.bill_date,
        due_date: latestForm.due_date,
        bill_number: latestForm.bill_number,
        total_amount: computedTotal,
        memo: latestForm.memo || null,
        is_draft: latestForm.is_draft,
      });
      rowVersion.set(updated.row_version);
      const headerWriteSeq = ++headerWriteSeqRef.current;
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

      const stampRow = (uid: string, patch: Partial<LineItemRow>) =>
        setLineItems((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

      for (const li of lineItems) {
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
        };

        if (li.public_id) {
          const result = await put<BillLineItem>(`/api/v1/update/bill_line_item/${li.public_id}`, {
            ...body,
            row_version: li.row_version!,
          });
          stampRow(li.uid, { row_version: result.row_version });
        } else {
          const result = await post<BillLineItem>("/api/v1/create/bill_line_item", body);
          stampRow(li.uid, { public_id: result.public_id, row_version: result.row_version });
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
      // appends a qbo_bill_url the header PUT does not return. Decline if a mid-loop
      // auto-save superseded this header PUT — caching its stale row_version would
      // re-create the 409, and leaving the entry untouched is no worse than pre-U-174.
      if (headerWriteSeqRef.current === headerWriteSeq) {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await saveAll()) {
      navigate(`/bill/${publicId}`);
    }
  };

  const handleComplete = async () => {
    if (!confirm("Complete this bill? This finalizes it and syncs to SharePoint, Excel, and QBO.")) return;
    const saved = await saveAll();
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
    const saved = await saveAll();
    if (!saved) return;
    setSubmitting(true);
    setSaveError("");
    try {
      await post(`/api/v1/submit/review/bill/${publicId}`, {});
      toast("Submitted for review — notification queued.");
      navigate(`/bill/${publicId}`);
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

  // Hoisted out of the line-item map: these depend on neither the row nor its
  // index, and the sub-cost-code catalog is ~500 rows — rebuilding both per row
  // per render meant N×(500+P) allocations on every keystroke in the table.
  // Same shape BillCreate computes once in its component body.
  const sccOptions = fullSubCostCodes.map((s) => ({ value: String(s.id), label: s.number ? `${s.number} — ${s.name}` : s.name }));
  const projectOptions = fullProjects.map((p) => ({ value: p.public_id, label: p.name }));

  return (
    <div className="page form-page-wide">
      <Breadcrumb
        crumbs={[
          { label: "Bills", path: "/bill/list" },
          { label: item?.bill_number || "…", path: `/bill/${publicId}` },
          { label: "Edit" },
        ]}
      />
      <div className="page-header">
        <h1>Edit Bill {item?.bill_number}</h1>
        <div className="page-header-spacer" />
        {form && (
          <span className={`status-badge ${form.is_draft ? "draft" : "finalized"}`}>
            {form.is_draft ? "Draft" : "Finalized"}
          </span>
        )}
      </div>
      <form className="detail-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}

        {publicId && <ReviewTimeline parentType="bill" parentPublicId={publicId} />}

        <div className="detail-fields-form">
          <FormField label="Bill Number" name="bill_number" value={form.bill_number} onChange={onChange} required />
          <SelectField
            label="Vendor"
            name="vendor_public_id"
            value={form.vendor_public_id}
            onChange={onChange}
            options={(lookups.vendors ?? []).map((v) => ({ value: v.public_id, label: v.name }))}
          />
          <DateField label="Bill Date" name="bill_date" value={form.bill_date} onChange={onChange} required />
          <DateField label="Due Date" name="due_date" value={form.due_date} onChange={onChange} required />
          <SelectField
            label="Payment Term"
            name="payment_term_public_id"
            value={form.payment_term_public_id}
            onChange={onChange}
            options={(lookups.payment_terms ?? []).map((pt) => ({ value: pt.public_id, label: pt.name }))}
          />
          <div className="form-group">
            <label>Total Amount</label>
            <div className="form-value">
              {lineItems.length > 0
                ? sumLineAmounts(lineItems).toLocaleString("en-US", { style: "currency", currency: "USD" })
                : "$0.00"}
            </div>
          </div>
          <div className="full-width">
            <TextareaField label="Memo" name="memo" value={form.memo} onChange={onChange} />
          </div>
        </div>

        <div className="li-cards-section">
          <div className="inline-li-header">
            <h3 className="line-items-heading">Line Items ({lineItems.length})</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLineItems([...lineItems.map(computeLineItem), computeLineItem(newLineItem())])}>
              + Add Row
            </button>
          </div>

          <table className="data-table line-items-edit-table">
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
                <th>Attachment</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty-state">
                    No line items. Click "+ Add Row" to start.
                  </td>
                </tr>
              )}
              {lineItems.map((li, idx) => {
                // Patch one row, then recompute EVERY row — computeLineItem repopulates
                // amount/price from stored values (U-167), so narrowing it to the edited
                // row would change which rows get derived.
                const patchRow = (patch: Partial<LineItemRow>) => {
                  const updated = lineItems.map((item, i) => (i === idx ? { ...item, ...patch } : item));
                  setLineItems(updated.map(computeLineItem));
                };
                const updateField = (key: string, value: any) =>
                  patchRow({ [key]: value } as Partial<LineItemRow>);
                const removeRow = () => setLineItems(lineItems.filter((_, i) => i !== idx));
                const projectSelectValue =
                  li.project_public_id ||
                  (li.unresolved_project_id != null ? UNRESOLVED_PROJECT_VALUE : "");
                // An explicit user pick — including "—" (clear) — drops the unresolved marker,
                // which is what distinguishes a real clear from a project we merely can't render.
                const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
                  const value = e.target.value;
                  if (value === UNRESOLVED_PROJECT_VALUE) return;
                  patchRow({ project_public_id: value, unresolved_project_id: undefined });
                };

                return (
                  <tr key={li.uid}>
                    <td>
                      <input className="inline-li-input" value={li.description} onChange={(e) => updateField("description", e.target.value)} />
                    </td>
                    <td>
                      <select className="inline-li-input" value={li.sub_cost_code_id} onChange={(e) => updateField("sub_cost_code_id", e.target.value)}>
                        <option value="">—</option>
                        {sccOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        className="inline-li-input"
                        value={projectSelectValue}
                        onChange={handleProjectChange}
                      >
                        <option value="">—</option>
                        {li.unresolved_project_id != null && (
                          <option value={UNRESOLVED_PROJECT_VALUE} disabled>
                            Project #{li.unresolved_project_id} (not in your projects)
                          </option>
                        )}
                        {projectOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <input className="inline-li-input" type="number" step="any" value={li.quantity} onChange={(e) => updateField("quantity", e.target.value)} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <input className="inline-li-input" type="number" step="any" value={li.rate} onChange={(e) => updateField("rate", e.target.value)} />
                    </td>
                    <td style={{ textAlign: "right" }} className="inline-li-computed">
                      {fmtMoney(li.amount)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <input className="inline-li-input" type="number" step="any" placeholder="0.10" value={li.markup} onChange={(e) => updateField("markup", e.target.value)} />
                    </td>
                    <td style={{ textAlign: "right" }} className="inline-li-computed">
                      {fmtMoney(li.price)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input type="checkbox" checked={li.is_billable} onChange={(e) => updateField("is_billable", e.target.checked)} />
                    </td>
                    <td>
                      {li.public_id ? (
                        <LineItemAttachment lineItemPublicId={li.public_id} entityType="bill" />
                      ) : (
                        <span className="text-muted" style={{ fontSize: 12 }}>Save first</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button type="button" className="inline-li-remove" onClick={removeRow} title="Remove">&times;</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="form-actions">
          {actions.canDelete && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={saving || completing || submitting || deleting}
              onClick={async () => {
                if (!confirm("Delete this bill? This cannot be undone.")) return;
                // confirm blocks the event loop, so no timer can fire while open.
                // An already-in-flight header PUT racing the DELETE is harmless —
                // matches 0 rows post-delete, silently caught.
                cancelAutoSave();
                setDeleting(true);
                try {
                  await deleteEntity(`/api/v1/delete/bill/${publicId}`);
                  queryClient.removeQueries({ queryKey: entityItemKey(billItemPath) });
                  toast("Bill deleted.");
                  navigate("/bill/list");
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
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/bill/${publicId}`)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || completing || submitting || deleting || !lineItemsLoaded}>
            {saving ? "Saving..." : "Save"}
          </button>
          {form.is_draft && actions.canSubmitForReview && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmitForReview}
              disabled={saving || completing || submitting || deleting || !lineItemsLoaded || !hasProjectOnLineItem}
              title={
                hasProjectOnLineItem
                  ? "Submit for review — drafts an email to the project PMs and advances the bill state."
                  : "Add a line item with a project before submitting for review."
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
              disabled={saving || completing || submitting || deleting || !lineItemsLoaded}
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
          <h3 className="line-items-heading">Attachment</h3>
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
