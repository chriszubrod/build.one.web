import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { RoleModule } from "../../types/api";

export default function RoleModuleEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<RoleModule>(`/api/v1/get/role_module/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    setForm({
      role_id: item.role_id,
      module_id: item.module_id,
      can_create: item.can_create,
      can_read: item.can_read,
      can_update: item.can_update,
      can_delete: item.can_delete,
      can_submit: item.can_submit,
      can_approve: item.can_approve,
      can_complete: item.can_complete,
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
      await updateEntity(`/api/v1/update/role_module/${id}`, {
        row_version: form.row_version,
        role_id: Number(form.role_id),
        module_id: Number(form.module_id),
        can_create: form.can_create,
        can_read: form.can_read,
        can_update: form.can_update,
        can_delete: form.can_delete,
        can_submit: form.can_submit,
        can_approve: form.can_approve,
        can_complete: form.can_complete,
      });
      navigate(`/role-module/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Role Module</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Role ID" name="role_id" value={form.role_id} onChange={onChange} type="number" required />
        <FormField label="Module ID" name="module_id" value={form.module_id} onChange={onChange} type="number" required />
        <div className="form-checkbox">
          <input type="checkbox" id="can_create" checked={form.can_create} onChange={(e) => setForm((p: any) => ({ ...p, can_create: e.target.checked }))} />
          <label htmlFor="can_create">Can Create</label>
        </div>
        <div className="form-checkbox">
          <input type="checkbox" id="can_read" checked={form.can_read} onChange={(e) => setForm((p: any) => ({ ...p, can_read: e.target.checked }))} />
          <label htmlFor="can_read">Can Read</label>
        </div>
        <div className="form-checkbox">
          <input type="checkbox" id="can_update" checked={form.can_update} onChange={(e) => setForm((p: any) => ({ ...p, can_update: e.target.checked }))} />
          <label htmlFor="can_update">Can Update</label>
        </div>
        <div className="form-checkbox">
          <input type="checkbox" id="can_delete" checked={form.can_delete} onChange={(e) => setForm((p: any) => ({ ...p, can_delete: e.target.checked }))} />
          <label htmlFor="can_delete">Can Delete</label>
        </div>
        <div className="form-checkbox">
          <input type="checkbox" id="can_submit" checked={form.can_submit} onChange={(e) => setForm((p: any) => ({ ...p, can_submit: e.target.checked }))} />
          <label htmlFor="can_submit">Can Submit</label>
        </div>
        <div className="form-checkbox">
          <input type="checkbox" id="can_approve" checked={form.can_approve} onChange={(e) => setForm((p: any) => ({ ...p, can_approve: e.target.checked }))} />
          <label htmlFor="can_approve">Can Approve</label>
        </div>
        <div className="form-checkbox">
          <input type="checkbox" id="can_complete" checked={form.can_complete} onChange={(e) => setForm((p: any) => ({ ...p, can_complete: e.target.checked }))} />
          <label htmlFor="can_complete">Can Complete</label>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/role-module/${id}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
