import { Navigate } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { canSeeEntry, findMenuEntry } from "./menuConfig";

/**
 * Decides the landing route for an authenticated user. Used in place of
 * the prior hardcoded `<Navigate to="/time-entry/list" replace />` for
 * both the root `/` redirect and the catch-all `*` route in App.tsx.
 *
 * Order of preference:
 *   1. Time Tracking — if me.is_admin OR Time Tracking.can_read
 *   2. Profile — unconditional fallback (everyone can see Profile)
 *
 * Renders a loading placeholder while /auth/me is in flight so the
 * redirect waits for the permission map. Without this guard, the very
 * first render would always default to Time Tracking and a no-Time
 * user would briefly see the time entry list before the redirect
 * kicked in.
 */
export default function LandingRedirect() {
  const { data: me, isLoading } = useCurrentUser();

  if (isLoading || !me) {
    return (
      <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
        Loading…
      </div>
    );
  }

  const timeEntry = findMenuEntry("time");
  if (timeEntry && canSeeEntry(timeEntry, me)) {
    return <Navigate to={timeEntry.route} replace />;
  }

  // Fallback: every authenticated user can see Profile.
  return <Navigate to="/profile" replace />;
}
