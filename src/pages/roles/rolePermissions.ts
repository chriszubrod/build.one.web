import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Roles have a dedicated module.
 *
 * Mirrors `require_module_api(Modules.ROLES, <perm>)` on the role
 * routes in build.one.api (entities/role/api/router.py) — keep in
 * lockstep.
 */
export function hasRolePermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.ROLES, permission);
}
