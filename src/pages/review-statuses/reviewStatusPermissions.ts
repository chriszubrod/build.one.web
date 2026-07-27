import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Review statuses have a dedicated module.
 *
 * Mirrors `require_module_api(Modules.REVIEW_STATUSES, <perm>)` on the
 * review-status routes in build.one.api
 * (entities/review_status/api/router.py) — keep in lockstep.
 */
export function hasReviewStatusPermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.REVIEW_STATUSES, permission);
}
