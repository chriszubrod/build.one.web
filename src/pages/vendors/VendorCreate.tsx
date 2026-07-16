import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createEntity, entityListKey } from "../../hooks/useEntity";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import type { Vendor } from "../../types/api";

export default function VendorCreate() {
  const navigate = useNavigate();
  const { data: lookups } = useLookups("vendor_types");
  const [form, setForm] = useState({
    name: "",
    abbreviation: "",
    vendor_type_public_id: "",
    is_draft: true,
    is_contract_labor: false,
    notes: "",
    hourly_rate: "",
    markup: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const queryClient = useQueryClient();

  const onChange = (name: string, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<Vendor>("/api/v1/create/vendor", {
        name: form.name,
        abbreviation: form.abbreviation || null,
        vendor_type_public_id: form.vendor_type_public_id || null,
        is_draft: form.is_draft,
        is_contract_labor: form.is_contract_labor,
        notes: form.notes || null,
        hourly_rate: form.hourly_rate || null,
        markup: form.markup || null,
      });
      queryClient.invalidateQueries({ queryKey: entityListKey("/api/v1/get/vendors") });
      navigate(`/vendor/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Create Vendor</h1>
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
            onChange={(e) => setForm((prev) => ({ ...prev, is_contract_labor: e.target.checked }))}
          />
          <label htmlFor="is_contract_labor">Contract Labor</label>
        </div>
        <div className="form-checkbox">
          <input
            type="checkbox"
            id="is_draft"
            checked={form.is_draft}
            onChange={(e) => setForm((prev) => ({ ...prev, is_draft: e.target.checked }))}
          />
          <label htmlFor="is_draft">Draft</label>
        </div>
        <FormField
          label="Hourly Rate (Default)"
          name="hourly_rate"
          value={form.hourly_rate}
          onChange={onChange}
          placeholder="e.g. 260.00 — used for contract-labor billing"
        />
        <FormField
          label="Markup (Default)"
          name="markup"
          value={form.markup}
          onChange={onChange}
          placeholder="e.g. 0.50 for 50%"
        />
        <div className="form-field">
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            rows={4}
            placeholder="Free-text notes — visible to agents during invoice processing (e.g. 'Trim trailing /N from invoice numbers')."
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/vendor/list")}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
