import { describe, expect, it } from "vitest";
import {
  DOCUMENT_STATUS_LABELS,
  documentReviewBadgeClass,
  documentReviewKind,
  documentStatus,
  documentStatusBadgeClass,
} from "./documentLifecycle";

describe("documentLifecycle", () => {
  it("falls back to is_draft when status is absent", () => {
    expect(documentStatus({ is_draft: true })).toBe("draft");
    expect(documentStatus({ is_draft: false })).toBe("completed");
    expect(documentStatus({ status: "submitted", is_draft: true })).toBe("submitted");
  });

  it("labels the six canonical statuses", () => {
    expect(DOCUMENT_STATUS_LABELS.completed).toBe("Completed");
    expect(DOCUMENT_STATUS_LABELS.in_review).toBe("In Review");
  });

  it("maps kinds onto existing badge classes", () => {
    expect(documentStatusBadgeClass("completed")).toBe("finalized");
    expect(documentStatusBadgeClass("in_review")).toBe("in-review");
    expect(documentReviewBadgeClass("declined")).toBe("declined");
    expect(documentReviewBadgeClass("none")).toBe("");
  });

  it("derives review kind from flags when kind is absent", () => {
    expect(documentReviewKind({ review_status_is_declined: true, review_status: "Declined" })).toBe(
      "declined",
    );
    expect(documentReviewKind({ review_status_is_final: true, review_status: "Approved" })).toBe(
      "approved",
    );
    expect(documentReviewKind({ review_status: "Submitted" })).toBe("in_review");
    expect(documentReviewKind({})).toBe("none");
    expect(documentReviewKind({ review_status_kind: "submitted" })).toBe("submitted");
  });
});
