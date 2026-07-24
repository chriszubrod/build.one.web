import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, updateEntity, invalidateEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import InlineContacts from "../../components/InlineContacts";
import type { Company } from "../../types/api";
import { hasCompanyPermission } from "./companyPermissions";

export default function CompanyEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canEdit = hasCompanyPermission(me, "can_update"); // PUT /api/v1/update/company/:publicId
  const { item, loading, error } = useEntityItem<Company>(`/api/v1/get/company/${publicId}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  // Which row seeded `form`. Router reuses this component across
  // /company/:publicId/edit params, so seeding on `!form` alone would
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
      website: item.website,
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
        <div className="page-error">You do not have permission to edit this company.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/company/${publicId}`)}>
          Back to Company
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
      await updateEntity(`/api/v1/update/company/${publicId}`, {
        row_version: form.row_version,
        name: form.name,
        website: form.website,
      });
      await invalidateEntity(queryClient, { listPath: "/api/v1/get/companies", itemPath: `/api/v1/get/company/${publicId}` });
      navigate(`/company/${publicId}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Company</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Website" name="website" value={form.website} onChange={onChange} required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/company/${publicId}`)}>Cancel</button>
        </div>
      </form>
      {item && (
        <div className="detail-card" style={{ marginTop: 24 }}>
          <InlineContacts parentEntity="company" parentId={item.id} />
        </div>
      )}
    </div>
  );
}
