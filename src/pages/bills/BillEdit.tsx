import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, entityItemKey } from "../../hooks/useEntity";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useSyncedToken } from "../../hooks/useSyncedToken";
import { useToast } from "../../components/Toast";
import { put, post, del, getList, getOne } from "../../api/client";
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
import type { Bill, BillLineItem } from "../../types/api";

interface LineItemRow {
  public_id?: string;
  row_version?: string;
  description: string;
  sub_cost_code_id: string;
  project_public_id: string;
  quantity: string;
  rate: string;
  amount: string;
  is_billable: boolean;
  markup: string;
  price: string;
}

function fmtMoney(v: string): string {
  if (!v) return "";
  const n = Number(v);
  if (isNaN(n)) return v;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const computeLineItem = (li: LineItemRow): LineItemRow => computeBillLine(li);

function newLineItem(): LineItemRow {
  return {
    description: "", sub_cost_code_id: "", project_public_id: "",
    quantity: "", rate: "", amount: "", is_billable: true, markup: "", price: "",
  };
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
    getList<BillLineItem>(`/api/v1/get/bill_line_items/bill/${item.id}`)
      .then((res) => {
        setOrigLineItemPublicIds(res.data.map((li) => li.public_id));
        setAttachmentPublicId(null);
        // Fetch attachment from first line item (one attachment shared across all)
        if (res.data.length > 0) {
          const firstLi = res.data[0];
          getOne<{ attachment_id: number }>(`/api/v1/get/bill-line-item-attachment/by-bill-line-item/${firstLi.public_id}`)
            .then((blia) => {
              if (blia.attachment_id) {
                getOne<{ public_id: string }>(`/api/v1/get/attachment/id/${blia.attachment_id}`)
                  .then((att) => setAttachmentPublicId(att.public_id))
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
        setLineItems(res.data.map((li) => {
          const project = li.project_id ? fullProjects.find((p) => p.id === li.project_id) : null;
          return computeLineItem({
            public_id: li.public_id,
            row_version: li.row_version,
            description: li.description ?? "",
            sub_cost_code_id: li.sub_cost_code_id != null ? String(li.sub_cost_code_id) : "",
            project_public_id: project?.public_id ?? "",
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
      })
      .catch(() => {
        setAttachmentPublicId(null);
      });
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
      setForm((prev: any) => ({ ...prev, row_version: updated.row_version }));

      // Sync line items: delete removed, update existing, create new
      const currentIds = new Set(lineItems.filter((li) => li.public_id).map((li) => li.public_id));
      for (const origId of origLineItemPublicIds) {
        if (!currentIds.has(origId)) {
          await del(`/api/v1/delete/bill_line_item/${origId}`);
        }
      }

      const savedItems: LineItemRow[] = [];
      for (const li of lineItems) {
        const body = {
          bill_public_id: publicId!,
          sub_cost_code_id: li.sub_cost_code_id !== "" ? Number(li.sub_cost_code_id) : null,
          project_public_id: li.project_public_id || null,
          description: li.description || null,
          quantity: li.quantity !== "" ? Number(li.quantity) : null,
          rate: li.rate !== "" ? Number(li.rate) : null,
          amount: li.amount !== "" ? Number(li.amount) : null,
          is_billable: li.is_billable,
          markup: li.markup !== "" ? Number(li.markup) : null,
          price: li.price !== "" ? Number(li.price) : null,
        };

        if (li.public_id) {
          const result = await put<BillLineItem>(`/api/v1/update/bill_line_item/${li.public_id}`, {
            ...body,
            row_version: li.row_version!,
          });
          savedItems.push({ ...li, row_version: result.row_version });
        } else {
          const result = await post<BillLineItem>("/api/v1/create/bill_line_item", body);
          savedItems.push({ ...li, public_id: result.public_id, row_version: result.row_version });
        }
      }
      setLineItems(savedItems);
      setOrigLineItemPublicIds(savedItems.map((li) => li.public_id!));
      persistedLineTotalRef.current = computedTotal;
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
  // least one line item carries a project.
  const hasProjectOnLineItem = lineItems.some((li) => !!li.project_public_id);

  return (
    <div className="page form-page-wide">
      <div className="page-header"><h1>Edit Bill {item?.bill_number}</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}

        {publicId && <ReviewTimeline parentType="bill" parentPublicId={publicId} />}

        <div className="form-header-grid">
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

          {lineItems.length === 0 && (
            <div className="li-card empty-state">No line items. Click "+ Add Row" to start.</div>
          )}

          {lineItems.map((li, idx) => {
            const updateField = (key: string, value: any) => {
              const updated = lineItems.map((item, i) => i === idx ? { ...item, [key]: value } : item);
              setLineItems(updated.map(computeLineItem));
            };
            const removeRow = () => setLineItems(lineItems.filter((_, i) => i !== idx));
            const sccOptions = fullSubCostCodes.map((s) => ({ value: String(s.id), label: s.number ? `${s.number} — ${s.name}` : s.name }));
            const projectOptions = fullProjects.map((p) => ({ value: p.public_id, label: p.name }));

            return (
              <div className="li-card" key={li.public_id ?? idx}>
                <div className="li-card-header">
                  <span className="li-card-num">#{idx + 1}</span>
                  <button type="button" className="inline-li-remove" onClick={removeRow} title="Remove">&times;</button>
                </div>

                <div className="li-card-row">
                  <div className="li-card-field" style={{ flex: 2 }}>
                    <label>Project</label>
                    <select className="inline-li-input" value={li.project_public_id} onChange={(e) => updateField("project_public_id", e.target.value)}>
                      <option value="">—</option>
                      {projectOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="li-card-field" style={{ flex: 2 }}>
                    <label>Sub Cost Code</label>
                    <select className="inline-li-input" value={li.sub_cost_code_id} onChange={(e) => updateField("sub_cost_code_id", e.target.value)}>
                      <option value="">—</option>
                      {sccOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="li-card-field" style={{ flex: 2 }}>
                    <label>Description</label>
                    <input className="inline-li-input" value={li.description} onChange={(e) => updateField("description", e.target.value)} />
                  </div>
                </div>

                <div className="li-card-row">
                  <div className="li-card-field">
                    <label>Qty</label>
                    <input className="inline-li-input" type="number" step="any" value={li.quantity} onChange={(e) => updateField("quantity", e.target.value)} />
                  </div>
                  <div className="li-card-field">
                    <label>Rate</label>
                    <input className="inline-li-input" type="number" step="any" value={li.rate} onChange={(e) => updateField("rate", e.target.value)} />
                  </div>
                  <div className="li-card-field">
                    <label>Amount</label>
                    <span className="inline-li-computed">{fmtMoney(li.amount)}</span>
                  </div>
                  <div className="li-card-field">
                    <label className="li-card-checkbox-label">
                      <input type="checkbox" checked={li.is_billable} onChange={(e) => updateField("is_billable", e.target.checked)} />
                      Billable
                    </label>
                  </div>
                  <div className="li-card-field">
                    <label>Markup</label>
                    <input className="inline-li-input" type="number" step="any" placeholder="0.10" value={li.markup} onChange={(e) => updateField("markup", e.target.value)} />
                  </div>
                  <div className="li-card-field">
                    <label>Price</label>
                    <span className="inline-li-computed">{fmtMoney(li.price)}</span>
                  </div>
                  <div className="li-card-field">
                    <label>Attachment</label>
                    {li.public_id ? (
                      <LineItemAttachment lineItemPublicId={li.public_id} entityType="bill" />
                    ) : (
                      <span className="text-muted" style={{ fontSize: 12 }}>Save first</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
