import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import type { ClassificationOverride } from "../../types/api";

const MATCH_TYPES = [
  { value: "email", label: "Email" },
  { value: "domain", label: "Domain" },
];

const CLASSIFICATION_TYPES = [
  { value: "BILL_DOCUMENT", label: "Bill Document" },
  { value: "BILL_CREDIT_DOCUMENT", label: "Bill Credit Document" },
  { value: "EXPENSE_DOCUMENT", label: "Expense Document" },
  { value: "EXPENSE_REFUND_DOCUMENT", label: "Expense Refund Document" },
  { value: "UNKNOWN", label: "Unknown" },
];

export default function ClassificationOverrideEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<ClassificationOverride>(`/api/v1/classification-overrides/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    setForm({
      match_type: item.match_type,
      match_value: item.match_value,
      classification_type: item.classification_type,
      notes: item.notes ?? "",
      is_active: item.is_active,
      row_version: item.row_version,
    });
  }

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  const onChange = (name: string, value: string) => setForm((prev: any) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/classification-overrides/${id}`, {
        row_version: form.row_version,
        match_type: form.match_type,
        match_value: form.match_value,
        classification_type: form.classification_type,
        notes: form.notes || null,
        is_active: form.is_active,
      });
      navigate(`/classification-override/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Classification Override</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <SelectField label="Match Type" name="match_type" value={form.match_type} onChange={onChange} options={MATCH_TYPES} required />
        <FormField label="Match Value" name="match_value" value={form.match_value} onChange={onChange} required />
        <SelectField label="Classification" name="classification_type" value={form.classification_type} onChange={onChange} options={CLASSIFICATION_TYPES} required />
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} />
        <div className="form-checkbox">
          <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm((p: any) => ({ ...p, is_active: e.target.checked }))} />
          <label htmlFor="is_active">Active</label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/classification-override/${id}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
