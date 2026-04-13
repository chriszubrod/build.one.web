import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import type { SubCostCode } from "../../types/api";

export default function SubCostCodeEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<SubCostCode>(`/api/v1/get/sub-cost-code/${id}`);
  const { data: lookups } = useLookups("cost_codes");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    // Find the cost_code's public_id from the lookups by matching internal id
    // For now, initialize empty — user must re-select if changing
    setForm({
      number: item.number,
      name: item.name,
      description: item.description ?? "",
      cost_code_public_id: "",
      row_version: item.row_version,
    });
  }

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  const onChange = (name: string, value: string) => setForm((prev: any) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cost_code_public_id) {
      setSaveError("Please select a Cost Code.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/sub-cost-code/${id}`, {
        row_version: form.row_version,
        number: form.number,
        name: form.name,
        description: form.description || null,
        cost_code_public_id: form.cost_code_public_id,
      });
      navigate(`/sub-cost-code/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Sub Cost Code</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Number" name="number" value={form.number} onChange={onChange} required />
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} />
        <SelectField
          label="Cost Code"
          name="cost_code_public_id"
          value={form.cost_code_public_id}
          onChange={onChange}
          options={(lookups.cost_codes ?? []).map((cc) => ({
            value: cc.public_id,
            label: `${cc.number} — ${cc.name}`,
          }))}
          required
        />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/sub-cost-code/${id}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
