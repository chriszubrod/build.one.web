import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FormField from "../../components/FormField";
import { useToast } from "../../components/Toast";
import { useAdminGate } from "../../hooks/useAdminGate";
import type { AdminAuditEntry, AdminUserSummary, Role } from "../../types/api";
import {
  assignRole,
  getAdminUser,
  getAdminUserAudit,
  listRoles,
  removeRole,
  setCredentials,
} from "./adminApi";

function formatFullName(summary: AdminUserSummary): string {
  const first = summary.firstname?.trim() ?? "";
  const last = summary.lastname?.trim() ?? "";
  return `${first} ${last}`.trim() || "—";
}

function formatLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatAuditDetail(
  entry: AdminAuditEntry,
  rolesById: Map<number, string>,
): string {
  const detail = entry.detail ?? {};
  if (entry.action === "auth.set_credentials") {
    const username =
      typeof detail.username === "string" ? detail.username : "—";
    const created = detail.created === true;
    const updated = detail.created === false;
    const verb = created ? "created" : updated ? "updated" : "changed";
    return `username: ${username}; ${verb}`;
  }
  if (
    entry.action === "user_role.assign" ||
    entry.action === "user_role.remove"
  ) {
    const roleId =
      typeof detail.role_id === "number" ? detail.role_id : null;
    const roleName =
      roleId != null ? rolesById.get(roleId) ?? String(roleId) : "—";
    return `role: ${roleName}`;
  }
  if (detail && Object.keys(detail).length > 0) {
    return JSON.stringify(detail);
  }
  return "—";
}

export default function AdminUserDetailPage() {
  const { publicId } = useParams<{ publicId: string }>();
  const { isAdmin, gate } = useAdminGate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credConfirm, setCredConfirm] = useState("");
  const [credUsernameError, setCredUsernameError] = useState<string | null>(
    null,
  );
  const [credPasswordError, setCredPasswordError] = useState<string | null>(
    null,
  );
  const [credConfirmError, setCredConfirmError] = useState<string | null>(null);
  const [credSaving, setCredSaving] = useState(false);
  const [roleBusy, setRoleBusy] = useState(false);

  const adminReady = isAdmin && !!publicId;

  const summaryQuery = useQuery({
    queryKey: ["admin-user", publicId],
    queryFn: () => getAdminUser(publicId!),
    enabled: adminReady,
  });

  // Shares the house role list cache entry (useEntityList registers under the
  // same ["list", path] key), so arriving here from /roles costs no refetch.
  // Private key on purpose (Pass-2 re-check): RoleList caches the same
  // endpoint under entityListKey() with its OWN 404/retry options; sharing one
  // key would share that failure state. Adopting useEntityList here is booked.
  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await listRoles();
      return res.data;
    },
    enabled: adminReady,
  });

  const auditQuery = useQuery({
    queryKey: ["admin-user-audit", publicId],
    queryFn: async () => {
      const res = await getAdminUserAudit(publicId!);
      return res;
    },
    enabled: adminReady,
  });

  const summary = summaryQuery.data;
  const allRoles = rolesQuery.data ?? [];
  const auditEntries = auditQuery.data?.data ?? [];

  const rolesById = useMemo(
    () => new Map(allRoles.map((r) => [r.id, r.name])),
    [allRoles],
  );

  const assignedRolePublicIds = useMemo(
    () => new Set(summary?.roles.map((r) => r.role_public_id) ?? []),
    [summary],
  );

  const availableRoles = useMemo(
    () => allRoles.filter((r) => !assignedRolePublicIds.has(r.public_id)),
    [allRoles, assignedRolePublicIds],
  );

  useEffect(() => {
    if (summary?.username) {
      setCredUsername(summary.username);
    }
  }, [summary?.public_id, summary?.username]);

  if (gate) return gate;
  if (!publicId) return <Navigate to="/admin" replace />;

  const invalidateUser = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-user", publicId] });
    void queryClient.invalidateQueries({
      queryKey: ["admin-user-audit", publicId],
    });
    // The /admin list caches username + roles per page; a mutation here must
    // dirty every page of it, not just this user's detail (Pass-1 P2).
    void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  };

  const handleRemoveRole = async (userRolePublicId: string, roleName: string) => {
    if (roleBusy) return;
    if (!window.confirm(`Remove role "${roleName}"?`)) return;
    setRoleBusy(true);
    try {
      await removeRole(userRolePublicId);
      toast("Role removed.");
      invalidateUser();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to remove role.", "error");
    } finally {
      setRoleBusy(false);
    }
  };

  const handleAssignRole = async () => {
    if (roleBusy || !summary || !selectedRoleId) return;
    const role = allRoles.find((r) => String(r.id) === selectedRoleId);
    if (!role) return;
    // In-flight lock: a double-click must not issue two privileged POSTs
    // (Pass-1 P2; mirrors the legacy profile page's roleLoading).
    setRoleBusy(true);
    try {
      await assignRole({ user_id: summary.id, role_id: role.id });
      toast("Role assigned.");
      setSelectedRoleId("");
      invalidateUser();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to assign role.", "error");
    } finally {
      setRoleBusy(false);
    }
  };

  const handleSetCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredUsernameError(null);
    setCredPasswordError(null);
    setCredConfirmError(null);

    let valid = true;
    if (!credUsername.trim()) {
      setCredUsernameError("Username is required.");
      valid = false;
    }
    if (credPassword.length < 8) {
      setCredPasswordError("Password must be at least 8 characters.");
      valid = false;
    }
    if (credPassword !== credConfirm) {
      setCredConfirmError("Passwords do not match.");
      valid = false;
    }
    if (!valid) return;

    setCredSaving(true);
    try {
      await setCredentials(publicId, {
        username: credUsername.trim(),
        password: credPassword,
      });
      toast(
        "Credentials saved. The user's existing sessions were signed out.",
      );
      invalidateUser();
    } catch (err: unknown) {
      toast(
        err instanceof Error ? err.message : "Failed to save credentials.",
        "error",
      );
    } finally {
      // Clear on EVERY outcome: a failed submit must not leave the plaintext
      // sitting in component state and both inputs (Pass-1 P2).
      setCredPassword("");
      setCredConfirm("");
      setCredSaving(false);
    }
  };

  if (summaryQuery.isLoading && !summary) {
    return <div className="page-loading">Loading…</div>;
  }
  if (summaryQuery.error) {
    return (
      <div className="page-error">
        {summaryQuery.error instanceof Error
          ? summaryQuery.error.message
          : "Failed to load user."}
      </div>
    );
  }
  if (!summary) {
    return <div className="page-error">User not found.</div>;
  }

  const usernameDisplay =
    summary.has_auth && summary.username
      ? summary.username
      : "No credentials yet";

  const createdDisplay = summary.created_datetime
    ? formatLocalDateTime(summary.created_datetime)
    : "—";

  return (
    <div className="page">
      <p style={{ marginBottom: "var(--space-md)" }}>
        <Link to="/admin">← Back to Users</Link>
      </p>

      <div className="page-header">
        <h1>{formatFullName(summary)}</h1>
        {summary.is_system_admin && (
          <span className="status-badge active">System administrator</span>
        )}
      </div>

      <div className="form-card" style={{ marginBottom: "var(--space-lg)" }}>
        <h3 className="line-items-heading">Info</h3>
        <dl className="detail-fields">
          <div className="detail-row">
            <dt>Username</dt>
            <dd>{usernameDisplay}</dd>
          </div>
          <div className="detail-row">
            <dt>Email</dt>
            <dd>{summary.email ?? "—"}</dd>
          </div>
          <div className="detail-row">
            <dt>Created</dt>
            <dd>{createdDisplay}</dd>
          </div>
        </dl>
      </div>

      <div className="form-card" style={{ marginBottom: "var(--space-lg)" }}>
        <h3 className="line-items-heading">Roles</h3>
        {summary.roles.length === 0 ? (
          <p className="text-muted">No roles assigned.</p>
        ) : (
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {summary.roles.map((ur) => (
                <tr key={ur.user_role_public_id}>
                  <td>{ur.role_name}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={roleBusy}
                      onClick={() =>
                        handleRemoveRole(ur.user_role_public_id, ur.role_name)
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="form-group" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="assign-role">Assign role</label>
            <select
              id="assign-role"
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
            >
              <option value="">Select…</option>
              {availableRoles.map((role: Role) => (
                <option key={role.public_id} value={String(role.id)}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selectedRoleId || roleBusy}
            onClick={() => void handleAssignRole()}
          >
            {roleBusy ? "Working…" : "Assign"}
          </button>
        </div>
      </div>

      <form className="form-card" style={{ marginBottom: "var(--space-lg)" }} onSubmit={handleSetCredentials}>
        <h3 className="line-items-heading">Reset password</h3>
        <FormField
          label="Username"
          name="cred_username"
          value={credUsername}
          onChange={(_name, value) => setCredUsername(value)}
          required
        />
        {credUsernameError && <div className="form-error">{credUsernameError}</div>}
        <div className="form-group">
          <label htmlFor="cred_password">New password</label>
          <input
            id="cred_password"
            type="password"
            autoComplete="new-password"
            value={credPassword}
            onChange={(e) => setCredPassword(e.target.value)}
          />
          {credPasswordError && <div className="form-error">{credPasswordError}</div>}
        </div>
        <div className="form-group">
          <label htmlFor="cred_confirm">Confirm password</label>
          <input
            id="cred_confirm"
            type="password"
            autoComplete="new-password"
            value={credConfirm}
            onChange={(e) => setCredConfirm(e.target.value)}
          />
          {credConfirmError && <div className="form-error">{credConfirmError}</div>}
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={credSaving}>
            {credSaving ? "Saving…" : "Save credentials"}
          </button>
        </div>
      </form>

      <div className="form-card">
        <h3 className="line-items-heading">Recent admin actions</h3>
        {auditQuery.error ? (
          // A failed audit read must never masquerade as "no actions" (Pass-1 P2).
          <div className="page-error">
            {auditQuery.error instanceof Error
              ? `Could not load admin actions: ${auditQuery.error.message}`
              : "Could not load admin actions."}
          </div>
        ) : auditEntries.length === 0 ? (
          <p className="text-muted">No admin actions recorded.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry) => (
                <tr key={entry.public_id}>
                  <td>{formatLocalDateTime(entry.created_datetime)}</td>
                  <td>
                    {entry.actor_name ??
                      (entry.actor_user_id != null
                        ? `User #${entry.actor_user_id}`
                        : "system")}
                  </td>
                  <td>{entry.action}</td>
                  <td>{formatAuditDetail(entry, rolesById)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
