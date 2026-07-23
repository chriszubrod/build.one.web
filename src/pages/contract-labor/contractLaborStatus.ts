/**
 * Shared Contract Labor status display maps.
 *
 * Live status vocab (matches the API + /labor review surface): pending_review /
 * submitted / ready / billed. The full rename (pending_review → draft, ready →
 * approved, billed → completed) lands in a follow-up — see LaborList.tsx.
 *
 * STATUS_CLASSES map onto existing .status-badge modifier classes in index.css
 * (`submitted` reuses `in-review`; there is no dedicated .submitted rule).
 * ContractLaborList keeps its own compact badge labels + page titles locally —
 * that divergence is deliberate (tighter table cells).
 */
export const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  submitted: "Submitted",
  ready: "Ready",
  billed: "Billed",
};

export const STATUS_CLASSES: Record<string, string> = {
  pending_review: "pending-review",
  submitted: "in-review",
  ready: "ready",
  billed: "billed",
};
