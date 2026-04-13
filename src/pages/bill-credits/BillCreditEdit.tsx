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
import type { BillCredit, BillCreditLineItem } from "../../types/api";

interface LineItemRow {
  public_id?: string;
  row_version?: string;
  description: string;
  sub_cost_code_id: string;
  project_public_id: string;
  quantity: string;
  unit_price: string;
  amount: string;
  is_billable: boolean;
  billable_amount: string;
}

const lineItemFields: LineItemFieldDef[] = [
  { key: "description", label: "Description", width: "200px" },
  { key: "sub_cost_code_id", label: "SCC ID", width: "80px", type: "number" },
  { key: "project_public_id", label: "Project ID", width: "120px" },
  { key: "quantity", label: "Qty", width: "70px", type: "number", align: "right" },
  { key: "unit_price", label: "Unit Price", width: "100px", type: "number", align: "right" },
  { key: "amount", label: "Amount", width: "100px", type: "number", align: "right" },
  { key: "is_billable", label: "Billable", width: "60px", type: "checkbox" },
  { key: "billable_amount", label: "Billable Amt", width: "110px", type: "number", align: "right" },
];

function newLineItem(): LineItemRow {
  return {
    description: "", sub_cost_code_id: "", project_public_id: "",
    quantity: "", unit_price: "", amount: "", is_billable: true, billable_amount: "",
  };
}

export default function BillCreditEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<BillCredit>(`/api/v1/get/bill-credit/${id}`);
  const { data: lookups } = useLookups("vendors");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [origLineItems, setOrigLineItems] = useState<BillCreditLineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Load line items
  useEffect(() => {
    if (!id) return;
    getList<BillCreditLineItem>(`/api/v1/get/bill-credit-line-items/by-bill-credit/${id}`)
      .then((res) => {
        setOrigLineItems(res.data);
        setLineItems(res.data.map((li) => ({
          public_id: li.public_id,
          row_version: li.row_version,
          description: li.description ?? "",
          sub_cost_code_id: li.sub_cost_code_id != null ? String(li.sub_cost_code_id) : "",
          project_public_id: "",
          quantity: li.quantity != null ? String(li.quantity) : "",
          unit_price: li.unit_price ?? "",
          amount: li.amount ?? "",
          is_billable: li.is_billable ?? true,
          billable_amount: li.billable_amount ?? "",
        })));
      })
      .catch(() => {});
  }, [id]);

  // Init header form
  if (item && !form) {
    setForm({
      vendor_public_id: "",
      credit_date: item.credit_date,
      credit_number: item.credit_number,
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
      const updated = await put<BillCredit>(`/api/v1/update/bill-credit/${id}`, {
        row_version: form.row_version,
        vendor_public_id: form.vendor_public_id || undefined,
        credit_date: form.credit_date,
        credit_number: form.credit_number,
        total_amount: form.total_amount !== "" ? Number(form.total_amount) : null,
        memo: form.memo || null,
        is_draft: form.is_draft,
      });
      setForm((prev: any) => ({ ...prev, row_version: updated.row_version }));

      // Sync line items: delete removed, update existing, create new
      const currentIds = new Set(lineItems.filter((li) => li.public_id).map((li) => li.public_id));
      for (const orig of origLineItems) {
        if (!currentIds.has(orig.public_id)) {
          await del(`/api/v1/delete/bill-credit-line-item/${orig.public_id}`);
        }
      }

      const savedItems: LineItemRow[] = [];
      for (const li of lineItems) {
        const body = {
          bill_credit_public_id: id!,
          sub_cost_code_id: li.sub_cost_code_id !== "" ? Number(li.sub_cost_code_id) : null,
          project_public_id: li.project_public_id || null,
          description: li.description || null,
          quantity: li.quantity !== "" ? Number(li.quantity) : null,
          unit_price: li.unit_price !== "" ? Number(li.unit_price) : null,
          amount: li.amount !== "" ? Number(li.amount) : null,
          is_billable: li.is_billable,
          billable_amount: li.billable_amount !== "" ? Number(li.billable_amount) : null,
        };

        if (li.public_id) {
          const result = await put<BillCreditLineItem>(`/api/v1/update/bill-credit-line-item/${li.public_id}`, {
            ...body,
            row_version: li.row_version!,
          });
          savedItems.push({ ...li, row_version: result.row_version });
        } else {
          const result = await post<BillCreditLineItem>("/api/v1/create/bill-credit-line-item", body);
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
      navigate(`/bill-credit/${id}`);
    }
  };

  const handleComplete = async () => {
    if (!confirm("Complete this bill credit? This will finalize and sync to external systems.")) return;
    const saved = await saveAll();
    if (!saved) return;
    setCompleting(true);
    try {
      await post(`/api/v1/complete/bill-credit/${id}`, {});
      navigate(`/bill-credit/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setCompleting(false);
    }
  };

  return (
    <div className="page form-page-wide">
      <div className="page-header"><h1>Edit Bill Credit {item?.credit_number}</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}

        <div className="form-header-grid">
          <FormField label="Credit Number" name="credit_number" value={form.credit_number} onChange={onChange} required />
          <SelectField
            label="Vendor"
            name="vendor_public_id"
            value={form.vendor_public_id}
            onChange={onChange}
            options={(lookups.vendors ?? []).map((v) => ({ value: v.public_id, label: v.name }))}
          />
          <DateField label="Credit Date" name="credit_date" value={form.credit_date} onChange={onChange} required />
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
                <LineItemAttachment lineItemPublicId={item.public_id} entityType="bill_credit" />
              ) : (
                <span className="text-muted" style={{ fontSize: 11 }}>Save first</span>
              ),
          }}
        />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || completing}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/bill-credit/${id}`)}>Cancel</button>
        </div>

        {form.is_draft && (
          <div className="complete-bar">
            <button
              type="button"
              className="btn btn-success"
              onClick={handleComplete}
              disabled={saving || completing}
            >
              {completing ? "Completing..." : "Complete Bill Credit"}
            </button>
            <span className="text-muted" style={{ fontSize: 13 }}>
              Finalizes the bill credit and syncs to SharePoint, Excel, and QBO.
            </span>
          </div>
        )}
      </form>
    </div>
  );
}
