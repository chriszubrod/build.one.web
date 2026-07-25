import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Employees have a dedicated module.
 *
 * Mirrors `require_module_api(Modules.EMPLOYEES, <perm>)` on the employee
 * routes in build.one.api (entities/employee/api/router.py) — keep in
 * lockstep.
 */
export function hasEmployeePermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.EMPLOYEES, permission);
}
