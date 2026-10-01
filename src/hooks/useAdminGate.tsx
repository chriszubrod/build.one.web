import type { JSX } from "react";
import { Navigate } from "react-router-dom";
import { useCurrentUser } from "./useCurrentUser";
import type { CurrentUser } from "../types/api";

interface AdminGate {
  me: CurrentUser | undefined;
  meLoading: boolean;
  /** True only once the profile has resolved AND it is an admin. */
  isAdmin: boolean;
  /**
   * The element the page must return INSTEAD of its own body, or null when
   * the caller is a confirmed admin and may render. Callers do
   * `if (gate) return gate;` AFTER all of their own hooks, so hook order
   * stays stable across the loading → resolved transition.
   */
  gate: JSX.Element | null;
}

/**
 * The admin-only page gate, in one place: shows the house page-loading shell
 * while /auth/me is in flight and redirects a non-admin to /profile.
 *
 * Presentational, not access control — the API re-checks admin on every
 * privileged call. This only keeps a hand-typed URL from rendering an admin
 * surface (see DocsPage's note on why that trade-off is acceptable).
 */
export function useAdminGate(): AdminGate {
  const { data: me, isLoading: meLoading } = useCurrentUser();

  const gate =
    meLoading || !me ? (
      <div className="ios-page">
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          Loading…
        </div>
      </div>
    ) : !me.is_admin ? (
      <Navigate to="/profile" replace />
    ) : null;

  return { me, meLoading, isAdmin: !meLoading && !!me?.is_admin, gate };
}
