import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { ReviewStatus } from "../../types/api";

export default function ReviewStatusCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    description: "",
    sort_order: "0",
    color: "",
    is_final: false,
    is_declined: false,
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<ReviewStatus>("/api/v1/create/review-status", {
        name: form.name,
        description: form.description || null,
        sort_order: Number(form.sort_order),
        color: form.color || null,
        is_final: form.is_final,
        is_declined: form.is_declined,
        is_active: form.is_active,
      });
      navigate(`/review-status/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Create Review Status</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} />
        <FormField label="Sort Order" name="sort_order" value={form.sort_order} onChange={onChange} type="number" />
        <FormField label="Color" name="color" value={form.color} onChange={onChange} placeholder="#1F3864" />
        <div className="form-checkbox">
          <input type="checkbox" id="is_final" checked={form.is_final} onChange={(e) => setForm((p) => ({ ...p, is_final: e.target.checked }))} />
          <label htmlFor="is_final">Final</label>
        </div>
        <div className="form-checkbox">
          <input type="checkbox" id="is_declined" checked={form.is_declined} onChange={(e) => setForm((p) => ({ ...p, is_declined: e.target.checked }))} />
          <label htmlFor="is_declined">Declined</label>
        </div>
        <div className="form-checkbox">
          <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
          <label htmlFor="is_active">Active</label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/review-status/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
