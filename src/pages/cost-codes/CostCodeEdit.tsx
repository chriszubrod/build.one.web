import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import type { CostCode } from "../../types/api";
import { hasCostCodePermission } from "./costCodePermissions";

export default function CostCodeEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canEdit = hasCostCodePermission(me, "can_update"); // PUT /api/v1/update/cost-code/:publicId
  const { item, loading, error } = useEntityItem<CostCode>(`/api/v1/get/cost-code/${publicId}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  // Which row seeded `form`. Router reuses this component across
  // /cost-code/:publicId/edit params, so seeding on `!form` alone would
  // carry row A's values (and row_version) onto row B; keying the seed by
  // public_id re-seeds on row change without clobbering in-progress edits on
  // a background refetch of the same row.
  const [formSeedId, setFormSeedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && formSeedId !== item.public_id) {
    setForm({
      number: item.number,
      name: item.name,
      description: item.description ?? "",
      row_version: item.row_version,
    });
    setFormSeedId(item.public_id);
  }

  if (loading || meLoading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  if (!canEdit) {
    return (
      <div className="page">
        <div className="page-error">You do not have permission to edit this cost code.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/cost-code/${publicId}`)}>
          Back to Cost Code
        </button>
      </div>
    );
  }

  const onChange = (name: string, value: string) => setForm((prev: any) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/cost-code/${publicId}`, {
        row_version: form.row_version,
        number: form.number,
        name: form.name,
        description: form.description || null,
      });
      navigate(`/cost-code/${publicId}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Cost Code</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Number" name="number" value={form.number} onChange={onChange} required />
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/cost-code/${publicId}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
