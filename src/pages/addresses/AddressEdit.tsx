import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, updateEntity, invalidateEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import type { Address } from "../../types/api";
import { hasAddressPermission } from "./addressPermissions";

export default function AddressEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canEdit = hasAddressPermission(me, "can_update"); // PUT /api/v1/update/address/:publicId
  const { item, loading, error } = useEntityItem<Address>(`/api/v1/get/address/${publicId}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  // Which row seeded `form`. Router reuses this component across
  // /address/:publicId/edit params, so seeding on `!form` alone would
  // carry row A's values (and row_version) onto row B; keying the seed by
  // public_id re-seeds on row change without clobbering in-progress edits on
  // a background refetch of the same row.
  const [formSeedId, setFormSeedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const queryClient = useQueryClient();

  if (item && formSeedId !== item.public_id) {
    setForm({
      street_one: item.street_one,
      street_two: item.street_two ?? "",
      city: item.city,
      state: item.state,
      zip: item.zip,
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
        <div className="page-error">You do not have permission to edit this address.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/address/${publicId}`)}>
          Back to Address
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
      await updateEntity(`/api/v1/update/address/${publicId}`, {
        row_version: form.row_version,
        street_one: form.street_one,
        street_two: form.street_two || null,
        city: form.city,
        state: form.state,
        zip: form.zip,
      });
      await invalidateEntity(queryClient, {
        listPath: "/api/v1/get/addresses",
        itemPath: `/api/v1/get/address/${publicId}`,
      });
      navigate(`/address/${publicId}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Address</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Street 1" name="street_one" value={form.street_one} onChange={onChange} required />
        <FormField label="Street 2" name="street_two" value={form.street_two} onChange={onChange} />
        <FormField label="City" name="city" value={form.city} onChange={onChange} required />
        <FormField label="State" name="state" value={form.state} onChange={onChange} required />
        <FormField label="Zip" name="zip" value={form.zip} onChange={onChange} required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/address/${publicId}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
