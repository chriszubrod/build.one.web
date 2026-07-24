import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Cost codes have a dedicated module.
 *
 * Mirrors `require_module_api(Modules.COST_CODES, <perm>)` on the cost-code
 * routes in build.one.api (entities/cost_code/api/router.py) — keep in
 * lockstep.
 */
export function hasCostCodePermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.COST_CODES, permission);
}
