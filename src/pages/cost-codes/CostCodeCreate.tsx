import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import type { CostCode } from "../../types/api";
import { hasCostCodePermission } from "./costCodePermissions";

export default function CostCodeCreate() {
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canCreate = hasCostCodePermission(me, "can_create"); // POST /api/v1/create/cost-code
  const [form, setForm] = useState({ number: "", name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<CostCode>("/api/v1/create/cost-code", {
        number: form.number,
        name: form.name,
        description: form.description || null,
      });
      navigate(`/cost-code/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  if (meLoading) return <div className="page-loading">Loading...</div>;
  if (!canCreate) {
    return (
      <div className="page">
        <div className="page-error">You do not have permission to create cost codes.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/cost-code/list")}>
          Back to Cost Codes
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header"><h1>Create Cost Code</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Number" name="number" value={form.number} onChange={onChange} required />
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/cost-code/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
