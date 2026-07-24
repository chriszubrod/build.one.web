/**
 * Sub-cost-code routes in build.one.api entities/sub_cost_code/api/router.py gate
 * on the SHARED Cost Codes module (there is no separate Sub Cost Codes module —
 * deliberate; keep in lockstep with the router).
 *
 * Re-exported as an alias rather than re-implemented: the shared gate is
 * structural — this IS the cost-code permission check under the entity's name.
 */
export { hasCostCodePermission as hasSubCostCodePermission } from "../cost-codes/costCodePermissions";
