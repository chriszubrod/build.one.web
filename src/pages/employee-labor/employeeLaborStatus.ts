export const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  ready: "Ready",
  invoiced: "Invoiced",
};

/**
 * Status values selectable on the Edit form. `invoiced` is set exclusively by the API at
 * complete_invoice time (EmployeeLaborService VALID_TRANSITIONS; a manual ready→invoiced
 * would orphan the row from invoicing — parked like the billing actions).
 */
export const EDITABLE_STATUS_OPTIONS = [
  { value: "pending_review", label: STATUS_LABELS.pending_review },
  { value: "ready", label: STATUS_LABELS.ready },
];
