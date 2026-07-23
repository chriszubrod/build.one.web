import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Vendor types are vendor reference data, gated on the Vendors module.
 *
 * Mirrors `require_module_api(Modules.VENDORS, <perm>)` on the vendor-type
 * routes in build.one.api (entities/vendor_type/api/router.py) — keep in
 * lockstep.
 */
export function hasVendorTypePermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.VENDORS, permission);
}
