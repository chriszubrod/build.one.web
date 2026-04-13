import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { UserProject } from "../../types/api";

export default function UserProjectCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ user_id: "", project_id: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<UserProject>("/api/v1/create/user_project", {
        user_id: Number(form.user_id),
        project_id: Number(form.project_id),
      });
      navigate(`/user-project/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Create User Project</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="User ID" name="user_id" value={form.user_id} onChange={onChange} type="number" required />
        <FormField label="Project ID" name="project_id" value={form.project_id} onChange={onChange} type="number" required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/user-project/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
