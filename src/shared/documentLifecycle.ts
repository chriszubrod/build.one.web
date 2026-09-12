/** Canonical document lifecycle labels (U-357). Shared by Bill and Expense. */

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  approved: "Approved",
  declined: "Declined",
  completed: "Completed",
};

export function documentStatus(item: {
  status?: string | null;
  is_draft: boolean;
}): string {
  return item.status ?? (item.is_draft ? "draft" : "completed");
}

export function documentStatusBadgeClass(status: string): string {
  switch (status) {
    case "draft":
      return "draft";
    case "submitted":
      return "submitted";
    case "in_review":
      return "in-review";
    case "approved":
      return "approved";
    case "declined":
      return "declined";
    case "completed":
      return "finalized";
    default:
      return "draft";
  }
}

export function documentReviewKind(item: {
  review_status_kind?: string | null;
  review_status?: string | null;
  review_status_is_final?: boolean | null;
  review_status_is_declined?: boolean | null;
}): string {
  if (item.review_status_kind && item.review_status_kind !== "none") {
    return item.review_status_kind;
  }
  if (item.review_status_is_declined) return "declined";
  if (item.review_status_is_final) return "approved";
  if (item.review_status) return "in_review";
  return "none";
}

export function documentReviewBadgeClass(kind?: string | null): string {
  switch (kind) {
    case "submitted":
      return "submitted";
    case "in_review":
      return "in-review";
    case "approved":
      return "approved";
    case "declined":
      return "declined";
    default:
      return "";
  }
}
