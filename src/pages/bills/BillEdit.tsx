import { useParams, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useEntityItem } from "../../hooks/useEntity";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useCompletionPolling } from "../../hooks/useCompletionPolling";
import { put, post, del, getList } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import InlineLineItems, { type LineItemFieldDef } from "../../components/InlineLineItems";
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

const lineItemFields: LineItemFieldDef[] = [
  { key: "description", label: "Description", width: "200px" },
  { key: "sub_cost_code_id", label: "SCC ID", width: "80px", type: "number" },
  { key: "project_public_id", label: "Project ID", width: "120px" },
  { key: "quantity", label: "Qty", width: "70px", type: "number", align: "right" },
  { key: "rate", label: "Rate", width: "90px", type: "number", align: "right" },
  { key: "amount", label: "Amount", width: "100px", type: "number", align: "right" },
  { key: "markup", label: "Markup", width: "80px", type: "number", align: "right", placeholder: "0.10" },
  { key: "price", label: "Price", width: "100px", type: "number", align: "right" },
  { key: "is_billable", label: "Billable", width: "60px", type: "checkbox" },
];

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
  const { data: lookups } = useLookups("vendors,payment_terms");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [origLineItems, setOrigLineItems] = useState<BillLineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { state: pollState, start: startPolling } = useCompletionPolling(
    `/api/v1/get/bill/${id}/completion-result`
  );

  // Load line items
  useEffect(() => {
    if (!item) return;
    getList<BillLineItem>(`/api/v1/get/bill_line_items/bill/${item.id}`)
      .then((res) => {
        setOrigLineItems(res.data);
        setLineItems(res.data.map((li) => ({
          public_id: li.public_id,
          row_version: li.row_version,
          description: li.description ?? "",
          sub_cost_code_id: li.sub_cost_code_id != null ? String(li.sub_cost_code_id) : "",
          project_public_id: "",
          quantity: li.quantity != null ? String(li.quantity) : "",
          rate: li.rate ?? "",
          amount: li.amount ?? "",
          is_billable: li.is_billable ?? true,
          markup: li.markup ?? "",
          price: li.price ?? "",
        })));
      })
      .catch(() => {});
  }, [item]);

  // Init header form
  if (item && !form) {
    setForm({
      vendor_public_id: "",
      payment_term_public_id: "",
      bill_date: item.bill_date,
      due_date: item.due_date,
      bill_number: item.bill_number,
      total_amount: item.total_amount ?? "",
      memo: item.memo ?? "",
      is_draft: item.is_draft,
      row_version: item.row_version,
    });
  }

  // Auto-save header on changes (300ms debounce)
  const autoSaveHeader = useCallback(async () => {
    if (!form || !id) return;
    try {
      const updated = await put<Bill>(`/api/v1/update/bill/${id}`, {
        row_version: form.row_version,
        vendor_public_id: form.vendor_public_id || undefined,
        payment_term_public_id: form.payment_term_public_id || undefined,
        bill_date: form.bill_date,
        due_date: form.due_date,
        bill_number: form.bill_number,
        total_amount: form.total_amount !== "" ? Number(form.total_amount) : null,
        memo: form.memo || null,
        is_draft: form.is_draft,
      });
      setForm((prev: any) => prev ? { ...prev, row_version: updated.row_version } : prev);
    } catch {
      // Silent fail for auto-save — errors shown on explicit save
    }
  }, [form, id]);

  const { flush: flushAutoSave } = useAutoSave(
    autoSaveHeader,
    [form?.bill_number, form?.vendor_public_id, form?.payment_term_public_id, form?.bill_date, form?.due_date, form?.total_amount, form?.memo],
    300,
    !!form && !!item,
  );

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  const onChange = (name: string, value: string) => setForm((prev: any) => ({ ...prev, [name]: value }));

  const saveAll = async () => {
    setSaving(true);
    setSaveError("");
    try {
      // Save header
      const updated = await put<Bill>(`/api/v1/update/bill/${id}`, {
        row_version: form.row_version,
        vendor_public_id: form.vendor_public_id || undefined,
        payment_term_public_id: form.payment_term_public_id || undefined,
        bill_date: form.bill_date,
        due_date: form.due_date,
        bill_number: form.bill_number,
        total_amount: form.total_amount !== "" ? Number(form.total_amount) : null,
        memo: form.memo || null,
        is_draft: form.is_draft,
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
    if (!confirm("Complete this bill? This will finalize and sync to external systems.")) return;
    await flushAutoSave();
    const saved = await saveAll();
    if (!saved) return;
    setCompleting(true);
    try {
      await post(`/api/v1/complete/bill/${id}`, {});
      startPolling();
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
          <FormField label="Total Amount" name="total_amount" value={form.total_amount} onChange={onChange} type="number" />
          <div className="full-width">
            <TextareaField label="Memo" name="memo" value={form.memo} onChange={onChange} />
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
                <LineItemAttachment lineItemPublicId={item.public_id} entityType="bill" />
              ) : (
                <span className="text-muted" style={{ fontSize: 11 }}>Save first</span>
              ),
          }}
        />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || completing}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/bill/${id}`)}>Cancel</button>
        </div>

        {form.is_draft && (
          <div className="complete-bar">
            <button
              type="button"
              className="btn btn-success"
              onClick={handleComplete}
              disabled={saving || completing}
            >
              {completing ? "Completing..." : "Complete Bill"}
            </button>
            <span className="text-muted" style={{ fontSize: 13 }}>
              Finalizes the bill and syncs to SharePoint, Excel, and QBO.
            </span>
          </div>
        )}

        {pollState.status === "polling" && (
          <div className="completion-status" style={{ marginTop: 16, padding: 12, background: "#eff6ff", borderRadius: 6, fontSize: 13 }}>
            Completing... (poll #{pollState.attempt})
          </div>
        )}
        {pollState.status === "complete" && (
          <div className="completion-status" style={{ marginTop: 16, padding: 12, background: "#dcfce7", borderRadius: 6, fontSize: 13 }}>
            Complete: {pollState.result.message}{" "}
            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/bill/${id}`)}>View Bill</button>
          </div>
        )}
        {pollState.status === "error" && (
          <div className="completion-status" style={{ marginTop: 16, padding: 12, background: "#fef2f2", borderRadius: 6, fontSize: 13, color: "#dc2626" }}>
            {pollState.message}
          </div>
        )}
      </form>
    </div>
  );
}
