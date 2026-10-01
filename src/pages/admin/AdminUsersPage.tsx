import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "../../components/PageHeader";
import { useAdminGate } from "../../hooks/useAdminGate";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { AdminUserSummary } from "../../types/api";
import { ADMIN_USERS_PAGE_SIZE, listAdminUsers } from "./adminApi";

function formatName(user: AdminUserSummary): string {
  const last = user.lastname?.trim() ?? "";
  const first = user.firstname?.trim() ?? "";
  if (last && first) return `${last}, ${first}`;
  return last || first || "—";
}

function formatRoles(user: AdminUserSummary): string {
  if (!user.roles.length) return "—";
  return user.roles.map((r) => r.role_name).join(", ");
}

export default function AdminUsersPage() {
  const { isAdmin, gate } = useAdminGate();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [offset, setOffset] = useState(0);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch]);

  const { data, error, isFetching } = useQuery({
    queryKey: ["admin-users", debouncedSearch, offset],
    queryFn: () =>
      listAdminUsers({
        search: debouncedSearch,
        limit: ADMIN_USERS_PAGE_SIZE,
        offset,
      }),
    enabled: isAdmin,
  });

  // Clamp an out-of-range offset (rows deleted underneath a deep page) back
  // to the last valid page instead of stranding the admin on an empty one
  // with no controls (Pass-1 P2).
  useEffect(() => {
    if (!data) return;
    // Functional update on purpose: when a search change and this clamp land
    // in the same batch (a previously-visited search has a cached result at
    // the old offset), the search-reset effect's setOffset(0) must win — the
    // updater re-checks against the LATEST offset, not the captured one.
    const count = data.count;
    setOffset((prev) => {
      if (count > 0 && prev >= count) {
        return Math.floor((count - 1) / ADMIN_USERS_PAGE_SIZE) * ADMIN_USERS_PAGE_SIZE;
      }
      if (count === 0 && prev > 0) return 0;
      return prev;
    });
  }, [data]);

  if (gate) return gate;

  const users = data?.data ?? [];
  const count = data?.count ?? 0;
  const start = count === 0 ? 0 : offset + 1;
  const end = Math.min(offset + ADMIN_USERS_PAGE_SIZE, count);
  const hasPrev = offset > 0;
  const hasNext = offset + ADMIN_USERS_PAGE_SIZE < count;
  // react-query v5: isLoading === isPending && isFetching, so `isLoading ||
  // isFetching` is isFetching in every state (including enabled:false, where
  // both are false).
  const listBusy = isFetching;

  return (
    <div className="page">
      <PageHeader title="Users" />
      <div className="table-search" style={{ marginBottom: "var(--space-md)" }}>
        <input
          type="search"
          placeholder="Search users…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search users"
        />
      </div>

      {listBusy && !data && (
        <div className="page-loading">Loading…</div>
      )}
      {error && (
        <div className="page-error">
          {error instanceof Error ? error.message : "Failed to load users."}
        </div>
      )}
      {!listBusy && !error && users.length === 0 && (
        <p className="text-muted">No users match</p>
      )}
      {/* Keep Prev reachable on an out-of-range page (Pass-1 P2); the clamp
          effect above also walks the offset back to the last valid page. */}
      {(users.length > 0 || offset > 0) && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.public_id}
                  className="clickable-row"
                  onClick={() => navigate(`/admin/user/${user.public_id}`)}
                >
                  <td>{formatName(user)}</td>
                  <td>{user.username ?? "—"}</td>
                  <td>{user.email ?? "—"}</td>
                  <td>{formatRoles(user)}</td>
                  <td>
                    {user.is_system_admin ? (
                      <span className="status-badge active">Admin</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <span className="pagination-info">
              Showing {start}–{end} of {count.toLocaleString()}
            </span>
            <div className="pagination-buttons">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!hasPrev}
                onClick={() => setOffset((o) => Math.max(0, o - ADMIN_USERS_PAGE_SIZE))}
              >
                Prev
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!hasNext}
                onClick={() => setOffset((o) => o + ADMIN_USERS_PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
