import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import type { SubCostCode } from "../../types/api";

export default function SubCostCodeCreate() {
  const navigate = useNavigate();
  const { data: lookups } = useLookups("cost_codes");
  const [form, setForm] = useState({ number: "", name: "", description: "", cost_code_public_id: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<SubCostCode>("/api/v1/create/sub-cost-code", {
        number: form.number,
        name: form.name,
        description: form.description || null,
        cost_code_public_id: form.cost_code_public_id,
      });
      navigate(`/sub-cost-code/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Create Sub Cost Code</h1></div>
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
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/sub-cost-code/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
