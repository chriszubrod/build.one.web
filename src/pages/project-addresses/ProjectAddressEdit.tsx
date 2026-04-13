import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { ProjectAddress } from "../../types/api";

export default function ProjectAddressEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<ProjectAddress>(`/api/v1/get/project_address/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    setForm({ project_id: item.project_id, address_id: item.address_id, address_type_id: item.address_type_id, row_version: item.row_version });
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
      await updateEntity(`/api/v1/update/project_address/${id}`, {
        row_version: form.row_version,
        project_id: Number(form.project_id),
        address_id: Number(form.address_id),
        address_type_id: Number(form.address_type_id),
      });
      navigate(`/project-address/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Project Address</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Project ID" name="project_id" value={form.project_id} onChange={onChange} type="number" required />
        <FormField label="Address ID" name="address_id" value={form.address_id} onChange={onChange} type="number" required />
        <FormField label="Address Type ID" name="address_type_id" value={form.address_type_id} onChange={onChange} type="number" required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/project-address/${id}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
