import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Mirrors `require_module_api(Modules.TIME_TRACKING, <perm>)` in build.one.api — keep in lockstep.
 * Deliberately not exported: callers should reach for the named predicates below,
 * which carry the route each one mirrors.
 */
function hasTimeTrackingPermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.TIME_TRACKING, permission);
}

/**
 * Gates the me/team ScopeToggle on Today and Past Day screens, and the
 * "log for another worker" picker on CreateLogScreen (can_view_team).
 *
 * The picker is a UI-only NARROWING, not a mirror: `POST /time-entries`
 * enforces only `can_create` and never consults `can_view_team`, so a
 * can_create-only user is blocked from picking another worker here while
 * the API would accept it. Deliberate — don't "fix" it by deleting the gate.
 *
 * U-108 note — this deliberately carries the system-admin bypass, which the
 * previous inline checks on those two screens omitted. That is a semantic
 * change with no runtime effect today: `/auth/me` synthesizes an all-true
 * permission row for EVERY module when `User.IsSystemAdmin = 1` (see
 * `_resolve_me_payload` in build.one.api), so an admin's `can_view_team` is
 * already true and "admin without the grant" is a state the API cannot emit.
 * The bypass is here so this mirror stays faithful to `require_module_api`
 * even if `/me` is ever narrowed to an admin's real grants.
 *
 * Server side agrees either way: the list sprocs filter on
 * `@ActorIsSystemAdmin = 1 OR te.UserId = @ActorUserId OR (@ActorCanViewTeam = 1 AND …)`,
 * so an admin sees team rows regardless of the flag.
 */
export function canViewTeamTimeEntries(me: CurrentUser | undefined | null): boolean {
  return hasTimeTrackingPermission(me, "can_view_team");
}

/**
 * Gates Approve/Reject on TimeEntryView — POST /time-entries/{id}/approve and /reject
 * (both enforce can_approve server-side).
 */
export function canApproveTimeEntry(me: CurrentUser | undefined | null): boolean {
  return hasTimeTrackingPermission(me, "can_approve");
}
