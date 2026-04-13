import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { ReviewStatus } from "../../types/api";

export default function ReviewStatusEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<ReviewStatus>(`/api/v1/get/review-status/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    setForm({
      name: item.name,
      description: item.description ?? "",
      sort_order: item.sort_order,
      color: item.color ?? "",
      is_final: item.is_final,
      is_declined: item.is_declined,
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
      await updateEntity(`/api/v1/update/review-status/${id}`, {
        row_version: form.row_version,
        name: form.name || null,
        description: form.description || null,
        sort_order: Number(form.sort_order),
        color: form.color || null,
        is_final: form.is_final,
        is_declined: form.is_declined,
        is_active: form.is_active,
      });
      navigate(`/review-status/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Review Status</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} />
        <FormField label="Sort Order" name="sort_order" value={form.sort_order} onChange={onChange} type="number" />
        <FormField label="Color" name="color" value={form.color} onChange={onChange} placeholder="#1F3864" />
        <div className="form-checkbox">
          <input type="checkbox" id="is_final" checked={form.is_final} onChange={(e) => setForm((p: any) => ({ ...p, is_final: e.target.checked }))} />
          <label htmlFor="is_final">Final</label>
        </div>
        <div className="form-checkbox">
          <input type="checkbox" id="is_declined" checked={form.is_declined} onChange={(e) => setForm((p: any) => ({ ...p, is_declined: e.target.checked }))} />
          <label htmlFor="is_declined">Declined</label>
        </div>
        <div className="form-checkbox">
          <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm((p: any) => ({ ...p, is_active: e.target.checked }))} />
          <label htmlFor="is_active">Active</label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/review-status/${id}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
