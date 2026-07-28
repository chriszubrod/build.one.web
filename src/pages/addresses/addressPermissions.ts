import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Addresses are vendor reference data, gated on the Vendors module.
 *
 * Mirrors `require_module_api(Modules.VENDORS, <perm>)` on every address route
 * in build.one.api entities/address/api/router.py — read/list gate on can_read,
 * create on can_create, update on can_update, delete on can_delete. There is NO
 * dedicated Address module; keep in lockstep with the router.
 */
export function hasAddressPermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.VENDORS, permission);
}
