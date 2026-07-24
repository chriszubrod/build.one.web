/**
 * ALL payment-term routes in build.one.api entities/payment_term/api/router.py gate
 * on the SHARED Bills module (there is no separate Payment Terms module —
 * deliberate piggyback; keep in lockstep with the router).
 */
export { hasBillPermission as hasPaymentTermPermission } from "../bills/billPermissions";
