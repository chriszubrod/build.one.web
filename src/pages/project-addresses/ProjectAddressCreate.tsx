import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { ProjectAddress } from "../../types/api";

export default function ProjectAddressCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ project_id: "", address_id: "", address_type_id: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<ProjectAddress>("/api/v1/create/project_address", {
        project_id: Number(form.project_id),
        address_id: Number(form.address_id),
        address_type_id: Number(form.address_type_id),
      });
      navigate(`/project-address/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Create Project Address</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Project ID" name="project_id" value={form.project_id} onChange={onChange} type="number" required />
        <FormField label="Address ID" name="address_id" value={form.address_id} onChange={onChange} type="number" required />
        <FormField label="Address Type ID" name="address_type_id" value={form.address_type_id} onChange={onChange} type="number" required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/project-address/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
