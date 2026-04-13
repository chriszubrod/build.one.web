import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { post } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import type { Invoice } from "../../types/api";

export default function InvoiceCreate() {
  const navigate = useNavigate();
  const { data: lookups } = useLookups("payment_terms");
  const [form, setForm] = useState({
    project_public_id: "",
    payment_term_public_id: "",
    invoice_date: "",
    due_date: "",
    invoice_number: "",
    total_amount: "",
    memo: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await post<Invoice>("/api/v1/create/invoice", {
        project_public_id: form.project_public_id,
        payment_term_public_id: form.payment_term_public_id || null,
        invoice_date: form.invoice_date,
        due_date: form.due_date,
        invoice_number: form.invoice_number,
        total_amount: form.total_amount !== "" ? Number(form.total_amount) : null,
        memo: form.memo || null,
        is_draft: true,
      });
      navigate(`/invoice/${created.public_id}/edit`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page form-page-wide">
      <div className="page-header"><h1>Create Invoice</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}

        <div className="form-header-grid">
          <FormField label="Invoice Number" name="invoice_number" value={form.invoice_number} onChange={onChange} required />
          <FormField label="Project ID" name="project_public_id" value={form.project_public_id} onChange={onChange} required />
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

        <p className="text-muted" style={{ marginTop: 16, fontSize: 13 }}>
          Save first, then add line items on the edit page.
        </p>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating..." : "Create & Edit"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/invoice/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
