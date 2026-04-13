import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import type { Taxpayer } from "../../types/api";

const CLASSIFICATIONS = [
  { value: "INDIVIDUAL_SOLE_PROPRIETOR", label: "Individual / Sole Proprietor" },
  { value: "C_CORPORATION", label: "C Corporation" },
  { value: "S_CORPORATION", label: "S Corporation" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "TRUST_ESTATE", label: "Trust / Estate" },
  { value: "LLC", label: "LLC" },
];

export default function TaxpayerCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    entity_name: "",
    business_name: "",
    classification: "",
    taxpayer_id_number: "",
    is_signed: 0,
    signature_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<Taxpayer>("/api/v1/create/taxpayer", {
        entity_name: form.entity_name || null,
        business_name: form.business_name || null,
        classification: form.classification || null,
        taxpayer_id_number: form.taxpayer_id_number || null,
        is_signed: form.is_signed,
        signature_date: form.signature_date || null,
      });
      navigate(`/taxpayer/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Create Taxpayer</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Entity Name" name="entity_name" value={form.entity_name} onChange={onChange} />
        <FormField label="Business Name" name="business_name" value={form.business_name} onChange={onChange} />
        <SelectField label="Classification" name="classification" value={form.classification} onChange={onChange} options={CLASSIFICATIONS} />
        <FormField label="TIN" name="taxpayer_id_number" value={form.taxpayer_id_number} onChange={onChange} />
        <div className="form-checkbox">
          <input type="checkbox" id="is_signed" checked={!!form.is_signed} onChange={(e) => setForm((p) => ({ ...p, is_signed: e.target.checked ? 1 : 0 }))} />
          <label htmlFor="is_signed">Signed</label>
        </div>
        <FormField label="Signature Date" name="signature_date" value={form.signature_date} onChange={onChange} placeholder="YYYY-MM-DD" />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/taxpayer/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
