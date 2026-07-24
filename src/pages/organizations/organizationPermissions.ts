import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Organizations have a dedicated module.
 *
 * Mirrors `require_module_api(Modules.ORGANIZATIONS, <perm>)` on the organization
 * routes in build.one.api (entities/organization/api/router.py) — keep in
 * lockstep.
 */
export function hasOrganizationPermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.ORGANIZATIONS, permission);
}
