import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Addresses are a shared catalog (vendors + projects) gated on Vendors.
 *
 * Intentional: project-only roles stay locked out of Address CRUD. There is
 * no Address module and no VENDORS|PROJECTS dual-gate. Mirrors
 * `require_module_api(Modules.VENDORS, <perm>)` on every address route in
 * build.one.api entities/address/api/router.py — read/list on can_read,
 * create on can_create, update on can_update, delete on can_delete. Leave
 * until Vendors unpark extracts a canonical owner (web U-157).
 */
export function hasAddressPermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.VENDORS, permission);
}
