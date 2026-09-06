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
 * Submit-for-Review's headline call, POST /submit/review/bill, is gated on
 * Bills can_submit (migrated from can_update 2026-09-06 — see
 * docs/design/rolemodule-can_submit-audit.md in build.one.api), so
 * canSubmitForReview needs can_submit IN ADDITION to canEdit's can_update, the
 * same compound-action shape as canComplete below.
 *
 * Route mapping to state: canEdit -> PUT /update/bill; canSubmitForReview ->
 * PUT /update/bill + POST /submit/review/bill; canDelete -> DELETE /delete/bill;
 * canComplete -> PUT /update/bill + POST /complete/bill.
 */
export function resolveBillEditActions(
  me: CurrentUser | undefined | null,
): BillEditActions {
  const canEdit = hasBillPermission(me, "can_update");
  return {
    canEdit,
    canDelete: hasBillPermission(me, "can_delete"),
    canSubmitForReview: canEdit && hasBillPermission(me, "can_submit"),
    canComplete: canEdit && hasBillPermission(me, "can_complete"),
  };
}
