import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { post } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import type { Expense } from "../../types/api";

export default function ExpenseCreate() {
  const navigate = useNavigate();
  const { data: lookups } = useLookups("vendors");
  const [form, setForm] = useState({
    vendor_public_id: "",
    expense_date: "",
    reference_number: "",
    total_amount: "",
    memo: "",
    is_credit: false,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await post<Expense>("/api/v1/create/expense", {
        vendor_public_id: form.vendor_public_id,
        expense_date: form.expense_date,
        reference_number: form.reference_number,
        total_amount: form.total_amount !== "" ? Number(form.total_amount) : null,
        memo: form.memo || null,
        is_credit: form.is_credit,
        is_draft: true,
      });
      navigate(`/expense/${created.public_id}/edit`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page form-page-wide">
      <div className="page-header"><h1>Create Expense</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}

        <div className="form-header-grid">
          <SelectField
            label="Vendor"
            name="vendor_public_id"
            value={form.vendor_public_id}
            onChange={onChange}
            options={(lookups.vendors ?? []).map((v) => ({ value: v.public_id, label: v.name }))}
            required
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
                onChange={(e) => setForm((prev) => ({ ...prev, is_credit: e.target.checked }))}
              />
              {" "}Is Credit
            </label>
          </div>
        </div>

        <p className="text-muted" style={{ marginTop: 16, fontSize: 13 }}>
          Save first, then add line items on the edit page.
        </p>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating..." : "Create & Edit"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/expense/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
