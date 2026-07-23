import { Modules } from "../../shared/modules";
import { hasModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

export interface BudgetEditActions {
  canEdit: boolean;
  canActivate: boolean;
  canApproveRevision: boolean;
}

/**
 * Resolves which Budget Edit UI actions the current user may use.
 *
 * BudgetEdit's Save-&-Activate and Save-&-Approve handlers both call saveAll()
 * first, which hits PUT /update/budget-revision + PUT /update/budget-line-item
 * (both can_update) — so each of those actions requires can_update IN ADDITION
 * to its own route permission. POST /activate/budget and POST
 * /approve/budget-revision both enforce can_approve.
 *
 * saveAll additionally hits POST /create/budget-line-item (can_create) for
 * newly added rows and DELETE /delete/budget-line-item (can_delete) for removed
 * rows; those legs are deliberately NOT folded into the gate (they only fire when
 * the grid changed shape) — the API remains the backstop and saveAll surfaces
 * the 403.
 */
export function resolveBudgetEditActions(
  me: CurrentUser | undefined | null,
): BudgetEditActions {
  const canEdit = hasModulePermission(me, Modules.BUDGETS, "can_update");
  const canApprove = hasModulePermission(me, Modules.BUDGETS, "can_approve");
  return {
    canEdit,
    canActivate: canEdit && canApprove,
    canApproveRevision: canEdit && canApprove,
  };
}
