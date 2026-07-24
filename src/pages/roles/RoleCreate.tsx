import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createEntity, invalidateEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import type { Role } from "../../types/api";
import { hasRolePermission } from "./rolePermissions";

export default function RoleCreate() {
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canCreate = hasRolePermission(me, "can_create"); // POST /api/v1/create/role
  const [form, setForm] = useState({ name: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const queryClient = useQueryClient();

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<Role>("/api/v1/create/role", { name: form.name });
      await invalidateEntity(queryClient, { listPath: "/api/v1/get/roles" });
      navigate(`/role/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  if (meLoading) return <div className="page-loading">Loading...</div>;
  if (!canCreate) {
    return (
      <div className="page">
        <div className="page-error">You do not have permission to create roles.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/role/list")}>
          Back to Roles
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header"><h1>Create Role</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/role/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
