import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import type { Project } from "../../types/api";

export default function ProjectCreate() {
  const navigate = useNavigate();
  const { data: lookups } = useLookups("customers");
  const [form, setForm] = useState({
    name: "",
    abbreviation: "",
    status: "",
    description: "",
    customer_public_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<Project>("/api/v1/create/project", {
        name: form.name,
        description: form.description,
        status: form.status,
        abbreviation: form.abbreviation || null,
        customer_public_id: form.customer_public_id || null,
      });
      navigate(`/project/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Create Project</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Abbreviation" name="abbreviation" value={form.abbreviation} onChange={onChange} />
        <FormField label="Status" name="status" value={form.status} onChange={onChange} required />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} required />
        <SelectField
          label="Customer"
          name="customer_public_id"
          value={form.customer_public_id}
          onChange={onChange}
          options={(lookups.customers ?? []).map((c) => ({
            value: c.public_id,
            label: c.name,
          }))}
        />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/project/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
