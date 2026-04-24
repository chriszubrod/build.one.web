import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import { getList, post, del } from "../../api/client";
import FormField from "../../components/FormField";
import InlineContacts from "../../components/InlineContacts";
import type { User, UserRole, Role } from "../../types/api";

export default function UserEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<User>(`/api/v1/get/user/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Inline role assignment state
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleLoading, setRoleLoading] = useState(false);

  // Load roles and user-role assignments
  useEffect(() => {
    if (!item) return;
    Promise.all([
      getList<Role>("/api/v1/get/roles"),
      getList<UserRole>("/api/v1/get/user_roles"),
    ]).then(([rolesRes, urRes]) => {
      setAllRoles(rolesRes.data);
      setUserRoles(urRes.data.filter((ur) => ur.user_id === item.id));
    }).catch(() => {});
  }, [item]);

  if (item && !form) {
    setForm({ firstname: item.firstname, lastname: item.lastname ?? "", row_version: item.row_version });
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
      await updateEntity(`/api/v1/update/user/${id}`, {
        row_version: form.row_version,
        firstname: form.firstname,
        lastname: form.lastname || null,
      });
      navigate(`/user/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  // Role assignment handlers
  const roleMap = new Map(allRoles.map((r) => [r.id, r.name]));
  const assignedRoleIds = new Set(userRoles.map((ur) => ur.role_id));
  const availableRoles = allRoles.filter((r) => !assignedRoleIds.has(r.id));

  const handleAddRole = async () => {
    if (!selectedRoleId || !item) return;
    setRoleLoading(true);
    try {
      const created = await post<UserRole>("/api/v1/create/user_role", {
        user_id: item.id,
        role_id: Number(selectedRoleId),
      });
      setUserRoles((prev) => [...prev, created]);
      setSelectedRoleId("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRoleLoading(false);
    }
  };

  const handleRemoveRole = async (ur: UserRole) => {
    if (!confirm(`Remove role "${roleMap.get(ur.role_id) ?? ur.role_id}"?`)) return;
    try {
      await del(`/api/v1/delete/user_role/${ur.public_id}`);
      setUserRoles((prev) => prev.filter((r) => r.public_id !== ur.public_id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit User</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="First Name" name="firstname" value={form.firstname} onChange={onChange} required />
        <FormField label="Last Name" name="lastname" value={form.lastname} onChange={onChange} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/user/${id}`)}>Cancel</button>
        </div>
      </form>

      {/* Inline role assignment */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <h3 className="line-items-heading">Roles ({userRoles.length})</h3>

        {userRoles.length > 0 && (
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Role</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {userRoles.map((ur) => (
                <tr key={ur.public_id}>
                  <td>{roleMap.get(ur.role_id) ?? ur.role_id}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRemoveRole(ur)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {availableRoles.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="inline-li-input"
              style={{ maxWidth: 200 }}
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
            >
              <option value="">Select role...</option>
              {availableRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleAddRole}
              disabled={!selectedRoleId || roleLoading}
            >
              {roleLoading ? "Adding..." : "Add Role"}
            </button>
          </div>
        )}
      </div>

      {item && (
        <div className="detail-card" style={{ marginTop: 24 }}>
          <InlineContacts parentEntity="user" parentId={item.id} />
        </div>
      )}
    </div>
  );
}
