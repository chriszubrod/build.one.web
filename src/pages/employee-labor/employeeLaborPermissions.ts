import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Mirrors `require_module_api(Modules.EMPLOYEE_LABOR, <perm>)` in build.one.api — keep in lockstep.
 *
 * Gate consumers: Edit refuse-renders + View edit link on can_update
 * (PUT /api/v1/update/employee-labor/{public_id}); View delete on can_delete
 * (DELETE /api/v1/delete/employee-labor/{public_id}).
 *
 * There is deliberately NO submit-for-review gate: the API review router
 * (entities/review/api/router.py) has no employee-labor submit routes — EL rows
 * enter review upstream via TimeEntry submit (Time Tracking module).
 */
export function hasEmployeeLaborPermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.EMPLOYEE_LABOR, permission);
}
