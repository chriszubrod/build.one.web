import { del, getList, getOne, post } from "../../api/client";
import type {
  AdminAuditEntry,
  AdminUserSummary,
  Role,
  UserRole,
} from "../../types/api";

export const ADMIN_USERS_PAGE_SIZE = 50;

export async function listAdminUsers(params: {
  search: string;
  limit: number;
  offset: number;
}): Promise<{ data: AdminUserSummary[]; count: number }> {
  const q = new URLSearchParams();
  // Omit an empty search instead of sending `search=` — the endpoint does
  // `(search or "").strip()`, so absent and empty are the same request to the
  // server, and leaving it off keeps the URL honest about what was asked.
  if (params.search) q.set("search", params.search);
  q.set("limit", String(params.limit));
  q.set("offset", String(params.offset));
  return getList<AdminUserSummary>(`/api/v1/admin/users?${q.toString()}`);
}

export async function getAdminUser(publicId: string): Promise<AdminUserSummary> {
  return getOne<AdminUserSummary>(`/api/v1/admin/user/${publicId}`);
}

// The `limit` seam is deliberate: surfacing an audit pager in the UI is booked
// as a follow-up (TODO.md "U-585 follow-ups"), and it reads the knob from here.
export async function getAdminUserAudit(
  publicId: string,
  limit = 50,
): Promise<{ data: AdminAuditEntry[]; count: number }> {
  return getList<AdminAuditEntry>(
    `/api/v1/admin/user/${publicId}/audit?limit=${limit}`,
  );
}

export async function setCredentials(
  publicId: string,
  body: { username: string; password: string },
): Promise<{ username: string; has_auth: boolean }> {
  return post<{ username: string; has_auth: boolean }>(
    `/api/v1/admin/auth/set-credentials/${publicId}`,
    body,
  );
}

export async function assignRole(body: {
  user_id: number;
  role_id: number;
}): Promise<UserRole> {
  return post<UserRole>("/api/v1/create/user_role", body);
}

export async function removeRole(userRolePublicId: string): Promise<void> {
  await del(`/api/v1/delete/user_role/${userRolePublicId}`);
}

export async function listRoles(): Promise<{ data: Role[]; count: number }> {
  return getList<Role>("/api/v1/get/roles");
}
