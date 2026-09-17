/** Re-export the shared document lifecycle helpers under the Expense names. */
export {
  DOCUMENT_STATUS_LABELS as EXPENSE_STATUS_LABELS,
  documentReviewBadgeClass as expenseReviewBadgeClass,
  documentReviewKind as expenseReviewKind,
  documentStatus as expenseStatus,
  documentStatusBadgeClass as expenseStatusBadgeClass,
} from "../../shared/documentLifecycle";
