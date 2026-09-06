import { Modules } from "../../shared/modules";
import { hasModulePermission, type ModulePermission } from "../../shared/permissions";
import type { CurrentUser } from "../../types/api";

/**
 * Mirrors `require_module_api(Modules.CONTRACT_LABOR, <perm>)` in build.one.api — keep in lockstep.
 */
export function hasContractLaborPermission(
  me: CurrentUser | undefined | null,
  permission: ModulePermission,
): boolean {
  return hasModulePermission(me, Modules.CONTRACT_LABOR, permission);
}

export interface ContractLaborEditActions {
  /** PUT /api/v1/contract-labor/{id}/bill — can_update */
  canEdit: boolean;
  /** DELETE /api/v1/contract-labor/{id} — can_delete */
  canDelete: boolean;
  /**
   * Submit For Review pre-saves via PUT /api/v1/contract-labor/{id}/bill
   * (Contract Labor can_update), then POSTs
   * /api/v1/submit/review/contract-labor/{id} — which the API gates on
   * Modules.TIME_TRACKING can_submit ("distinct from Modules.CONTRACT_LABOR
   * which gates the CRUD pages", review/api/router.py; migrated from
   * can_update 2026-09-06, see docs/design/rolemodule-can_submit-audit.md in
   * build.one.api). Compound action: both are required.
   */
  canSubmit: boolean;
}

/**
 * Resolves which Contract Labor Edit UI actions the current user may use.
 */
export function resolveContractLaborEditActions(
  me: CurrentUser | undefined | null,
): ContractLaborEditActions {
  const canEdit = hasContractLaborPermission(me, "can_update");
  return {
    canEdit,
    canDelete: hasContractLaborPermission(me, "can_delete"),
    canSubmit: canEdit && hasModulePermission(me, Modules.TIME_TRACKING, "can_submit"),
  };
}
