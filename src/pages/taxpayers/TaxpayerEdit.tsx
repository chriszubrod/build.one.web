import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
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

export default function TaxpayerEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<Taxpayer>(`/api/v1/get/taxpayer/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    setForm({
      entity_name: item.entity_name ?? "",
      business_name: item.business_name ?? "",
      classification: item.classification ?? "",
      taxpayer_id_number: item.taxpayer_id_number ?? "",
      is_signed: item.is_signed,
      signature_date: item.signature_date ?? "",
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
      await updateEntity(`/api/v1/update/taxpayer/${id}`, {
        row_version: form.row_version,
        entity_name: form.entity_name || null,
        business_name: form.business_name || null,
        classification: form.classification || null,
        taxpayer_id_number: form.taxpayer_id_number || null,
        is_signed: form.is_signed ? 1 : 0,
        signature_date: form.signature_date || null,
      });
      navigate(`/taxpayer/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Taxpayer</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Entity Name" name="entity_name" value={form.entity_name} onChange={onChange} />
        <FormField label="Business Name" name="business_name" value={form.business_name} onChange={onChange} />
        <SelectField label="Classification" name="classification" value={form.classification} onChange={onChange} options={CLASSIFICATIONS} />
        <FormField label="TIN" name="taxpayer_id_number" value={form.taxpayer_id_number} onChange={onChange} />
        <div className="form-checkbox">
          <input type="checkbox" id="is_signed" checked={!!form.is_signed} onChange={(e) => setForm((p: any) => ({ ...p, is_signed: e.target.checked ? 1 : 0 }))} />
          <label htmlFor="is_signed">Signed</label>
        </div>
        <FormField label="Signature Date" name="signature_date" value={form.signature_date} onChange={onChange} placeholder="YYYY-MM-DD" />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/taxpayer/${id}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
