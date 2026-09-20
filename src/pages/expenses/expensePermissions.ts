import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Mirrors `require_module_api(Modules.EXPENSES, <perm>)` in build.one.api — keep in lockstep.
 */
export function hasExpensePermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.EXPENSES, permission);
}

export interface ExpenseEditActions {
  canEdit: boolean;
  canDelete: boolean;
  canSubmitForReview: boolean;
  canComplete: boolean;
}

/**
 * Resolves which Expense Edit UI actions the current user may use.
 *
 * ExpenseEdit's Complete handler and ReviewTimeline's submit/advance/decline
 * (via onBeforeAction) both call saveAll() first, which PUTs
 * PUT /update/expense/{public_id} (can_update) — including the 300ms auto-save
 * — so those actions require can_update IN ADDITION to their own route
 * permission. canEdit also gates the form because the auto-save issues the same
 * can_update-guarded PUT.
 *
 * Submit-for-review's headline call, POST /submit/review/expense, is gated on
 * Expenses can_submit (same gate ReviewTimeline uses internally), so
 * canSubmitForReview needs can_submit IN ADDITION to canEdit's can_update.
 *
 * Route mapping: canEdit -> PUT /update/expense; canSubmitForReview ->
 * PUT /update/expense + POST /submit/review/expense; canDelete ->
 * DELETE /delete/expense; canComplete -> PUT /update/expense +
 * POST /complete/expense.
 */
export function resolveExpenseEditActions(
  me: CurrentUser | undefined | null,
): ExpenseEditActions {
  const canEdit = hasExpensePermission(me, "can_update");
  return {
    canEdit,
    canDelete: hasExpensePermission(me, "can_delete"),
    canSubmitForReview: canEdit && hasExpensePermission(me, "can_submit"),
    canComplete: canEdit && hasExpensePermission(me, "can_complete"),
  };
}
