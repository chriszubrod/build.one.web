import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Mirrors `require_module_api(Modules.BILLS, <perm>)` in build.one.api — keep in lockstep.
 */
export function hasBillPermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.BILLS, permission);
}

export interface BillEditActions {
  canEdit: boolean;
  canDelete: boolean;
  canSubmitForReview: boolean;
  canComplete: boolean;
}

/**
 * Resolves which Bill Edit UI actions the current user may use.
 *
 * BillEdit's Complete and Submit-for-Review handlers both call saveAll() first,
 * which PUTs /update/bill (can_update) — so each of those actions requires
 * can_update IN ADDITION to its own route permission. canEdit also gates the
 * form itself because the 300ms auto-save issues the same can_update-guarded PUT.
 *
 * Route mapping to state: canEdit -> PUT /update/bill + POST /submit/review/bill;
 * canDelete -> DELETE /delete/bill; canComplete -> POST /complete/bill.
 */
export function resolveBillEditActions(
  me: CurrentUser | undefined | null,
): BillEditActions {
  const canEdit = hasBillPermission(me, "can_update");
  return {
    canEdit,
    canDelete: hasBillPermission(me, "can_delete"),
    canSubmitForReview: canEdit,
    canComplete: canEdit && hasBillPermission(me, "can_complete"),
  };
}
