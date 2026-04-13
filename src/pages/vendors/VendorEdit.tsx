import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import InlineContacts from "../../components/InlineContacts";
import type { Vendor } from "../../types/api";

export default function VendorEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<Vendor>(`/api/v1/get/vendor/${id}`);
  const { data: lookups } = useLookups("vendor_types");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Initialize form from loaded item
  if (item && !form) {
    setForm({
      name: item.name,
      abbreviation: item.abbreviation ?? "",
      vendor_type_public_id: "", // TODO: would need vendor_type_public_id on Vendor response
      is_draft: item.is_draft,
      is_contract_labor: item.is_contract_labor,
      row_version: item.row_version,
    });
  }

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  const onChange = (name: string, value: string) => {
    setForm((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/vendor/${id}`, {
        row_version: form.row_version,
        name: form.name,
        abbreviation: form.abbreviation || null,
        vendor_type_public_id: form.vendor_type_public_id || null,
        is_draft: form.is_draft,
        is_contract_labor: form.is_contract_labor,
      });
      navigate(`/vendor/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Edit Vendor</h1>
      </div>

      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}

        <FormField
          label="Name"
          name="name"
          value={form.name}
          onChange={onChange}
          required
        />
        <FormField
          label="Abbreviation"
          name="abbreviation"
          value={form.abbreviation}
          onChange={onChange}
        />
        <SelectField
          label="Vendor Type"
          name="vendor_type_public_id"
          value={form.vendor_type_public_id}
          onChange={onChange}
          options={(lookups.vendor_types ?? []).map((vt) => ({
            value: vt.public_id,
            label: vt.name,
          }))}
        />
        <div className="form-checkbox">
          <input
            type="checkbox"
            id="is_contract_labor"
            checked={form.is_contract_labor}
            onChange={(e) => setForm((prev: any) => ({ ...prev, is_contract_labor: e.target.checked }))}
          />
          <label htmlFor="is_contract_labor">Contract Labor</label>
        </div>
        <div className="form-checkbox">
          <input
            type="checkbox"
            id="is_draft"
            checked={form.is_draft}
            onChange={(e) => setForm((prev: any) => ({ ...prev, is_draft: e.target.checked }))}
          />
          <label htmlFor="is_draft">Draft</label>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(`/vendor/${id}`)}
          >
            Cancel
          </button>
        </div>
      </form>

      {item && (
        <div className="detail-card" style={{ marginTop: 24 }}>
          <InlineContacts parentEntity="vendor" parentId={item.id} />
        </div>
      )}
    </div>
  );
}
