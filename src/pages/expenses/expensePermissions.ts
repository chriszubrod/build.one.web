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
  canComplete: boolean;
}

/**
 * Resolves which Expense Edit UI actions the current user may use.
 *
 * ExpenseEdit's Complete handler calls saveAll() first, which PUTs
 * PUT /update/expense/{public_id} (can_update) — including the 300ms auto-save
 * and the Complete pre-save — so Complete requires can_update IN ADDITION to
 * POST /complete/expense/{public_id} (can_complete).
 *
 * The expense surface has no entity-level Delete or Submit-for-Review buttons,
 * so deliberately no canDelete/canSubmit members; ReviewTimeline gates its own
 * actions (U-108).
 */
export function resolveExpenseEditActions(
  me: CurrentUser | undefined | null,
): ExpenseEditActions {
  const canEdit = hasExpensePermission(me, "can_update");
  return {
    canEdit,
    canComplete: canEdit && hasExpensePermission(me, "can_complete"),
  };
}
