import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useEntityItem } from "../../hooks/useEntity";
import { put, post, del, getList, getOne } from "../../api/client";
import { useViewAttachmentObjectUrl } from "../../hooks/useViewAttachmentObjectUrl";
import { useLookups } from "../../hooks/useLookups";
import { useEntityList } from "../../hooks/useEntity";
import type { Vendor as FullVendor, SubCostCode, Project } from "../../types/api";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import LineItemAttachment from "../../components/LineItemAttachment";
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

function computeLineItem(li: LineItemRow): LineItemRow {
  const qty = li.quantity !== "" ? Number(li.quantity) : 0;
  const rate = li.rate !== "" ? Number(li.rate) : 0;
  const markup = li.markup !== "" ? Number(li.markup) : 0;
  const amount = qty * rate;
  const price = amount * (1 + markup);
  return {
    ...li,
    amount: amount ? amount.toFixed(2) : "",
    price: price ? price.toFixed(2) : "",
  };
}

function newLineItem(): LineItemRow {
  return {
    description: "", sub_cost_code_id: "", project_public_id: "",
    quantity: "", rate: "", amount: "", is_billable: true, markup: "", price: "",
  };
}

export default function BillEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<Bill>(`/api/v1/get/bill/${id}`);
  const { data: lookups } = useLookups("vendors,payment_terms,sub_cost_codes,projects");
  const { items: fullVendors } = useEntityList<FullVendor>("/api/v1/get/vendors");
  const { items: fullPaymentTerms } = useEntityList<{ id: number; public_id: string }>("/api/v1/get/payment-terms");
  const { items: fullSubCostCodes } = useEntityList<SubCostCode>("/api/v1/get/sub-cost-codes");
  const { items: fullProjects } = useEntityList<Project>("/api/v1/get/projects");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const formRef = useRef(form);
  formRef.current = form;
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [origLineItems, setOrigLineItems] = useState<BillLineItem[]>([]);
  const [attachmentPublicId, setAttachmentPublicId] = useState<string | null>(null);
  const { objectUrl: attachmentBlobUrl, loading: attachmentLoading, loadError: attachmentLoadError } =
    useViewAttachmentObjectUrl(attachmentPublicId);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Load line items
  useEffect(() => {
    if (!item || fullProjects.length === 0) return;
    getList<BillLineItem>(`/api/v1/get/bill_line_items/bill/${item.id}`)
      .then((res) => {
        setOrigLineItems(res.data);
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


  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  const onChange = (name: string, value: string) => setForm((prev: any) => ({ ...prev, [name]: value }));

  const saveAll = async () => {
    const latestForm = formRef.current;
    if (!latestForm) return false;
    setSaving(true);
    setSaveError("");
    try {
      // Save header — total_amount computed from line items
      const computedTotal = lineItems.reduce((sum, li) => sum + (li.amount !== "" ? Number(li.amount) : 0), 0);
      const updated = await put<Bill>(`/api/v1/update/bill/${id}`, {
        row_version: latestForm.row_version,
        vendor_public_id: latestForm.vendor_public_id || undefined,
        payment_term_public_id: latestForm.payment_term_public_id || undefined,
        bill_date: latestForm.bill_date,
        due_date: latestForm.due_date,
        bill_number: latestForm.bill_number,
        total_amount: computedTotal,
        memo: latestForm.memo || null,
        is_draft: latestForm.is_draft,
      });
      setForm((prev: any) => ({ ...prev, row_version: updated.row_version }));

      // Sync line items: delete removed, update existing, create new
      const currentIds = new Set(lineItems.filter((li) => li.public_id).map((li) => li.public_id));
      for (const orig of origLineItems) {
        if (!currentIds.has(orig.public_id)) {
          await del(`/api/v1/delete/bill_line_item/${orig.public_id}`);
        }
      }

      const savedItems: LineItemRow[] = [];
      for (const li of lineItems) {
        const body = {
          bill_public_id: id!,
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
      setOrigLineItems([]); // Reset tracking after successful save
      return true;
    } catch (err: any) {
      setSaveError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await saveAll()) {
      navigate(`/bill/${id}`);
    }
  };

  const handleComplete = async () => {
    const saved = await saveAll();
    if (!saved) return;
    setCompleting(true);
    setSaveError("");
    try {
      await post(`/api/v1/complete/bill/${id}`, {});
      navigate("/bill/list");
    } catch (err: any) {
      setSaveError(err.message);
      setCompleting(false);
    }
  };

  return (
    <div className="page form-page-wide">
      <div className="page-header"><h1>Edit Bill {item?.bill_number}</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}

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
                ? lineItems.reduce((sum, li) => sum + (li.amount !== "" ? Number(li.amount) : 0), 0)
                    .toLocaleString("en-US", { style: "currency", currency: "USD" })
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
          <button type="submit" className="btn btn-primary" disabled={saving || completing}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/bill/${id}`)}>Cancel</button>
          {form.is_draft && (
            <button
              type="button"
              className="btn btn-success"
              onClick={handleComplete}
              disabled={saving || completing}
            >
              {completing ? "Completing..." : "Complete Bill"}
            </button>
          )}
        </div>

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
