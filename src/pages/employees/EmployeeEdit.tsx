import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { Employee } from "../../types/api";

export default function EmployeeEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<Employee>(`/api/v1/get/employee/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Hydrate form once on first load
  if (item && !form) {
    setForm({
      firstname: item.firstname,
      lastname: item.lastname,
      email: item.email ?? "",
      hourly_rate: item.hourly_rate ?? "",
      markup: item.markup ?? "",
      is_active: item.is_active,
      notes: item.notes ?? "",
      row_version: item.row_version,
    });
  }

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item || !form) return <div className="page-error">Employee not found.</div>;

  const onChange = (name: string, value: any) => {
    setForm((f) => (f ? { ...f, [name]: value } : f));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/employee/${id}`, {
        row_version: form.row_version,
        firstname: form.firstname,
        lastname: form.lastname,
        email: form.email || null,
        hourly_rate: form.hourly_rate || null,
        markup: form.markup || null,
        is_active: form.is_active,
        notes: form.notes || null,
      });
      navigate(`/employee/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Edit Employee</h2>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="First Name" name="firstname" value={form.firstname} onChange={onChange} required />
        <FormField label="Last Name" name="lastname" value={form.lastname} onChange={onChange} required />
        <FormField label="Email" name="email" value={form.email} onChange={onChange} type="email" />
        <FormField label="Hourly Rate" name="hourly_rate" value={form.hourly_rate} onChange={onChange} placeholder="e.g. 75.00" />
        <FormField label="Markup (decimal)" name="markup" value={form.markup} onChange={onChange} placeholder="e.g. 0.50 for 50%" />
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={!!form.is_active}
              onChange={(e) => onChange("is_active", e.target.checked)}
            />{" "}
            Active
          </label>
        </div>
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} multiline />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/employee/${id}`)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
