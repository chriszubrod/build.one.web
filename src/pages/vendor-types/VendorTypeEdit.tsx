import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import type { VendorType } from "../../types/api";
import { hasVendorTypePermission } from "./vendorTypePermissions";

export default function VendorTypeEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canEdit = hasVendorTypePermission(me, "can_update"); // PUT /api/v1/update/vendor-type/:publicId
  const { item, loading, error } = useEntityItem<VendorType>(`/api/v1/get/vendor-type/${publicId}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    setForm({
      name: item.name ?? "",
      description: item.description ?? "",
      row_version: item.row_version,
    });
  }

  if (loading || meLoading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  if (!canEdit) {
    return (
      <div className="page">
        <div className="page-error">You do not have permission to edit this vendor type.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/vendor-type/${publicId}`)}>
          Back to Vendor Type
        </button>
      </div>
    );
  }

  const onChange = (name: string, value: string) => {
    setForm((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/vendor-type/${publicId}`, {
        row_version: form.row_version,
        name: form.name || null,
        description: form.description || null,
      });
      navigate(`/vendor-type/${publicId}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Vendor Type</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/vendor-type/${publicId}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
