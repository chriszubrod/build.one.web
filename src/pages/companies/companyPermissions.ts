import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Companies have a dedicated module.
 *
 * Mirrors `require_module_api(Modules.COMPANIES, <perm>)` on the company
 * routes in build.one.api (entities/company/api/router.py) — keep in
 * lockstep.
 */
export function hasCompanyPermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.COMPANIES, permission);
}
