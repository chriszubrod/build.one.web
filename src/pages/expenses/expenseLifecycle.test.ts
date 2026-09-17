import { describe, it, expect } from "vitest";
import {
  EXPENSE_STATUS_LABELS,
  expenseReviewBadgeClass,
  expenseReviewKind,
  expenseStatus,
  expenseStatusBadgeClass,
} from "./expenseLifecycle";
import { documentReviewKind } from "../../shared/documentLifecycle";

describe("expenseLifecycle", () => {
  it("falls back to is_draft when status is absent", () => {
    expect(expenseStatus({ is_draft: true })).toBe("draft");
    expect(expenseStatus({ is_draft: false })).toBe("completed");
    expect(expenseStatus({ status: "submitted", is_draft: true })).toBe("submitted");
  });

  it("labels the six canonical statuses", () => {
    expect(EXPENSE_STATUS_LABELS.completed).toBe("Completed");
    expect(EXPENSE_STATUS_LABELS.in_review).toBe("In Review");
  });

  it("maps kinds onto existing badge classes", () => {
    expect(expenseStatusBadgeClass("completed")).toBe("finalized");
    expect(expenseStatusBadgeClass("in_review")).toBe("in-review");
    expect(expenseReviewBadgeClass("declined")).toBe("declined");
    expect(expenseReviewBadgeClass("none")).toBe("");
  });

  it("re-exports documentReviewKind as expenseReviewKind", () => {
    expect(expenseReviewKind).toBe(documentReviewKind);
  });

  it("classes a flags-only payload instead of leaving the badge class-less", () => {
    const declined = expenseReviewKind({ review_status_is_declined: true });
    expect(declined).toBe("declined");
    expect(expenseReviewBadgeClass(declined)).toBe("declined");
    expect(expenseReviewBadgeClass(declined)).not.toBe("");

    const approved = expenseReviewKind({ review_status_is_final: true });
    expect(approved).toBe("approved");
    expect(expenseReviewBadgeClass(approved)).toBe("approved");
  });
});
