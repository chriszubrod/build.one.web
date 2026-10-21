import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Mirrors `require_module_api(Modules.INVOICES, <perm>)` in build.one.api — keep in lockstep.
 */
export function hasInvoicePermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.INVOICES, permission);
}

export interface InvoiceEditActions {
  canDelete: boolean;
}

/**
 * Resolves Invoice Edit delete affordance only (U-684b).
 *
 * canDelete mirrors DELETE /api/v1/delete/invoice/{public_id} (can_delete).
 * Save and Complete gating are handled separately.
 */
export function resolveInvoiceEditActions(
  me: CurrentUser | undefined | null,
): InvoiceEditActions {
  return {
    canDelete: hasInvoicePermission(me, "can_delete"),
  };
}
