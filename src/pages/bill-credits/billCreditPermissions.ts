import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Mirrors `require_module_api(Modules.BILL_CREDITS, <perm>)` in build.one.api — keep in lockstep.
 */
export function hasBillCreditPermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.BILL_CREDITS, permission);
}

export interface BillCreditEditActions {
  canEdit: boolean;
  canComplete: boolean;
  canDelete: boolean;
}

/**
 * Resolves which Bill Credit Edit UI actions the current user may use.
 *
 * BillCreditEdit's Complete handler calls saveAll() first, which PUTs
 * PUT /api/v1/update/bill-credit/{public_id} (can_update) — including the
 * Complete pre-save — so Complete requires can_update IN ADDITION to
 * POST /api/v1/complete/bill-credit/{public_id} (can_complete).
 *
 * canDelete mirrors DELETE /api/v1/delete/bill-credit/{public_id} (can_delete).
 * ReviewTimeline gates its own actions (U-108); no canSubmit here.
 */
export function resolveBillCreditEditActions(
  me: CurrentUser | undefined | null,
): BillCreditEditActions {
  const canEdit = hasBillCreditPermission(me, "can_update");
  return {
    canEdit,
    canComplete: canEdit && hasBillCreditPermission(me, "can_complete"),
    canDelete: hasBillCreditPermission(me, "can_delete"),
  };
}
