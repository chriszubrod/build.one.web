import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { UserModule } from "../../types/api";

export default function UserModuleEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<UserModule>(`/api/v1/get/user_module/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    setForm({ user_id: item.user_id, module_id: item.module_id, row_version: item.row_version });
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
      await updateEntity(`/api/v1/update/user_module/${id}`, {
        row_version: form.row_version,
        user_id: Number(form.user_id),
        module_id: Number(form.module_id),
      });
      navigate(`/user-module/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit User Module</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="User ID" name="user_id" value={form.user_id} onChange={onChange} type="number" required />
        <FormField label="Module ID" name="module_id" value={form.module_id} onChange={onChange} type="number" required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/user-module/${id}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
