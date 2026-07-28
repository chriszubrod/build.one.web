import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, updateEntity, invalidateEntity, invalidateLookups } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import type { Role } from "../../types/api";
import { hasRolePermission } from "./rolePermissions";

export default function RoleEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canEdit = hasRolePermission(me, "can_update"); // PUT /api/v1/update/role/:publicId
  const { item, loading, error } = useEntityItem<Role>(
    `/api/v1/get/role/${publicId}`,
  );
  const [form, setForm] = useState<Record<string, any> | null>(null);
  // Which row seeded `form`. Router reuses this component across
  // /role/:publicId/edit params, so seeding on `!form` alone would
  // carry row A's values (and row_version) onto row B; keying the seed by
  // public_id re-seeds on row change without clobbering in-progress edits on
  // a background refetch of the same row.
  const [formSeedId, setFormSeedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const queryClient = useQueryClient();

  if (item && formSeedId !== item.public_id) {
    setForm({
      name: item.name,
      row_version: item.row_version,
    });
    setFormSeedId(item.public_id);
  }

  if (loading || meLoading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item || !form) return null;

  if (!canEdit) {
    return (
      <div className="page">
        <div className="page-error">You do not have permission to edit this role.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/role/${publicId}`)}>
          Back to Role
        </button>
      </div>
    );
  }

  const onChange = (name: string, value: string) =>
    setForm((prev: any) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/role/${publicId}`, {
        row_version: form.row_version,
        name: form.name,
      });
      await invalidateEntity(queryClient, {
        listPath: "/api/v1/get/roles",
        itemPath: `/api/v1/get/role/${publicId}`,
      });
      await invalidateLookups(queryClient);
      navigate(`/role/${publicId}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Role</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/role/${publicId}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
