import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEntityItem } from "../../hooks/useEntity";
import { put, post, del, getList } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import InlineLineItems, { type LineItemFieldDef } from "../../components/InlineLineItems";
import LineItemAttachment from "../../components/LineItemAttachment";
import ReviewTimeline from "../../components/ReviewTimeline";
import type { Invoice, InvoiceLineItem } from "../../types/api";

interface LineItemRow {
  public_id?: string;
  row_version?: string;
  source_type: string;
  description: string;
  sub_cost_code_id: string;
  bill_line_item_id: string;
  expense_line_item_id: string;
  bill_credit_line_item_id: string;
  quantity: string;
  rate: string;
  amount: string;
  markup: string;
  price: string;
}

const SOURCE_TYPE_OPTIONS = [
  { value: "BillLineItem", label: "BillLineItem" },
  { value: "ExpenseLineItem", label: "ExpenseLineItem" },
  { value: "BillCreditLineItem", label: "BillCreditLineItem" },
  { value: "Manual", label: "Manual" },
];

const lineItemFields: LineItemFieldDef[] = [
  { key: "source_type", label: "Source Type", width: "150px", type: "select", options: SOURCE_TYPE_OPTIONS },
  { key: "description", label: "Description", width: "200px" },
  { key: "sub_cost_code_id", label: "SCC ID", width: "80px", type: "number" },
  { key: "bill_line_item_id", label: "Bill LI ID", width: "90px", type: "number" },
  { key: "expense_line_item_id", label: "Expense LI ID", width: "100px", type: "number" },
  { key: "bill_credit_line_item_id", label: "Credit LI ID", width: "100px", type: "number" },
  { key: "quantity", label: "Qty", width: "70px", type: "number", align: "right" },
  { key: "rate", label: "Rate", width: "90px", type: "number", align: "right" },
  { key: "amount", label: "Amount", width: "100px", type: "number", align: "right" },
  { key: "markup", label: "Markup", width: "80px", type: "number", align: "right", placeholder: "0.10" },
  { key: "price", label: "Price", width: "100px", type: "number", align: "right" },
];

function newLineItem(): LineItemRow {
  return {
    source_type: "Manual",
    description: "",
    sub_cost_code_id: "",
    bill_line_item_id: "",
    expense_line_item_id: "",
    bill_credit_line_item_id: "",
    quantity: "",
    rate: "",
    amount: "",
    markup: "",
    price: "",
  };
}

export default function InvoiceEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<Invoice>(`/api/v1/get/invoice/${id}`);
  const { data: lookups } = useLookups("payment_terms");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [origLineItems, setOrigLineItems] = useState<InvoiceLineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Load line items
  useEffect(() => {
    if (!item) return;
    getList<InvoiceLineItem>(`/api/v1/get/invoice_line_items/invoice/${item.id}`)
      .then((res) => {
        setOrigLineItems(res.data);
        setLineItems(res.data.map((li) => ({
          public_id: li.public_id,
          row_version: li.row_version,
          source_type: li.source_type ?? "Manual",
          description: li.description ?? "",
          sub_cost_code_id: li.sub_cost_code_id != null ? String(li.sub_cost_code_id) : "",
          bill_line_item_id: li.bill_line_item_id != null ? String(li.bill_line_item_id) : "",
          expense_line_item_id: li.expense_line_item_id != null ? String(li.expense_line_item_id) : "",
          bill_credit_line_item_id: li.bill_credit_line_item_id != null ? String(li.bill_credit_line_item_id) : "",
          quantity: li.quantity != null ? String(li.quantity) : "",
          rate: li.rate ?? "",
          amount: li.amount ?? "",
          markup: li.markup ?? "",
          price: li.price ?? "",
        })));
      })
      .catch(() => {});
  }, [item]);

  // Init header form
  if (item && !form) {
    setForm({
      project_public_id: "",
      payment_term_public_id: "",
      invoice_date: item.invoice_date,
      due_date: item.due_date,
      invoice_number: item.invoice_number,
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
    setSaving(true);
    setSaveError("");
    try {
      // Save header
      const updated = await put<Invoice>(`/api/v1/update/invoice/${id}`, {
        row_version: form.row_version,
        project_public_id: form.project_public_id || undefined,
        payment_term_public_id: form.payment_term_public_id || undefined,
        invoice_date: form.invoice_date,
        due_date: form.due_date,
        invoice_number: form.invoice_number,
        total_amount: form.total_amount !== "" ? Number(form.total_amount) : null,
        memo: form.memo || null,
        is_draft: form.is_draft,
      });
      setForm((prev: any) => ({ ...prev, row_version: updated.row_version }));

      // Sync line items: delete removed, update existing, create new
      const currentIds = new Set(lineItems.filter((li) => li.public_id).map((li) => li.public_id));
      for (const orig of origLineItems) {
        if (!currentIds.has(orig.public_id)) {
          await del(`/api/v1/delete/invoice_line_item/${orig.public_id}`);
        }
      }

      const savedItems: LineItemRow[] = [];
      for (const li of lineItems) {
        const body = {
          invoice_public_id: id!,
          source_type: li.source_type,
          description: li.description || null,
          sub_cost_code_id: li.sub_cost_code_id !== "" ? Number(li.sub_cost_code_id) : null,
          bill_line_item_id: li.bill_line_item_id !== "" ? Number(li.bill_line_item_id) : null,
          expense_line_item_id: li.expense_line_item_id !== "" ? Number(li.expense_line_item_id) : null,
          bill_credit_line_item_id: li.bill_credit_line_item_id !== "" ? Number(li.bill_credit_line_item_id) : null,
          quantity: li.quantity !== "" ? Number(li.quantity) : null,
          rate: li.rate !== "" ? Number(li.rate) : null,
          amount: li.amount !== "" ? Number(li.amount) : null,
          markup: li.markup !== "" ? Number(li.markup) : null,
          price: li.price !== "" ? Number(li.price) : null,
        };

        if (li.public_id) {
          const result = await put<InvoiceLineItem>(`/api/v1/update/invoice_line_item/${li.public_id}`, {
            ...body,
            row_version: li.row_version!,
          });
          savedItems.push({ ...li, row_version: result.row_version });
        } else {
          const result = await post<InvoiceLineItem>("/api/v1/create/invoice_line_item", body);
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
      navigate(`/invoice/${id}`);
    }
  };

  const handleComplete = async () => {
    if (!confirm("Complete this invoice? This will finalize and mark source items as billed.")) return;
    const saved = await saveAll();
    if (!saved) return;
    setCompleting(true);
    try {
      await post(`/api/v1/complete/invoice/${id}`, {});
      navigate(`/invoice/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setCompleting(false);
    }
  };

  return (
    <div className="page form-page-wide">
      <div className="page-header"><h1>Edit Invoice {item?.invoice_number}</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}

        {id && <ReviewTimeline parentType="invoice" parentPublicId={id} />}

        <div className="form-header-grid">
          <FormField label="Invoice Number" name="invoice_number" value={form.invoice_number} onChange={onChange} required />
          <FormField label="Project ID" name="project_public_id" value={form.project_public_id} onChange={onChange} />
          <DateField label="Invoice Date" name="invoice_date" value={form.invoice_date} onChange={onChange} required />
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
                <LineItemAttachment lineItemPublicId={item.public_id} entityType="invoice" />
              ) : (
                <span className="text-muted" style={{ fontSize: 11 }}>Save first</span>
              ),
          }}
        />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || completing}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/invoice/${id}`)}>Cancel</button>
        </div>

        {form.is_draft && (
          <div className="complete-bar">
            <button
              type="button"
              className="btn btn-success"
              onClick={handleComplete}
              disabled={saving || completing}
            >
              {completing ? "Completing..." : "Complete Invoice"}
            </button>
            <span className="text-muted" style={{ fontSize: 13 }}>
              Finalizes the invoice and marks source items as billed.
            </span>
          </div>
        )}
      </form>
    </div>
  );
}
