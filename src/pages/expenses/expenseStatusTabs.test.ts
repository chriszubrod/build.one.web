import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATUS_TAB,
  STATUS_TABS,
  expenseListQuery,
  isStatusTab,
  resolveStatusTab,
} from "./expenseStatusTabs";
import { EXPENSE_STATUS_LABELS } from "./expenseLifecycle";

describe("expenses status tabs (U-470)", () => {
  it("offers exactly the six canonical lifecycle states, in lifecycle order", () => {
    expect(STATUS_TABS.map((t) => t.value)).toEqual([
      "draft",
      "submitted",
      "in_review",
      "approved",
      "declined",
      "completed",
    ]);
  });

  it("has no 'All' tab", () => {
    // Deliberate (Chris, 2026-09-11), same product decision as Bills. Pinned
    // because re-adding it is a product decision, not a tidy-up — with no All
    // tab there is no single view of every in-flight expense, which is why
    // the default moved to in_review.
    expect(STATUS_TABS.some((t) => t.value === ("" as string))).toBe(false);
    expect(STATUS_TABS.some((t) => /all/i.test(t.label))).toBe(false);
  });

  it("labels the tabs the same way the badges do", () => {
    for (const tab of STATUS_TABS) {
      expect(tab.label).toBe(EXPENSE_STATUS_LABELS[tab.value]);
    }
  });

  it("defaults to in_review, not to the empty draft tab", () => {
    expect(DEFAULT_STATUS_TAB).toBe("in_review");
    expect(resolveStatusTab(null)).toBe("in_review");
    expect(resolveStatusTab(undefined)).toBe("in_review");
    expect(resolveStatusTab("")).toBe("in_review");
  });

  it("falls back rather than forwarding junk the API would reject", () => {
    expect(resolveStatusTab("billed")).toBe("in_review");
    expect(resolveStatusTab("Draft")).toBe("in_review"); // case matters
    expect(resolveStatusTab("finalized")).toBe("in_review");
    expect(resolveStatusTab("'; DROP TABLE Expense--")).toBe("in_review");
  });

  it("round-trips every legal tab", () => {
    for (const { value } of STATUS_TABS) {
      expect(resolveStatusTab(value)).toBe(value);
      expect(isStatusTab(value)).toBe(true);
    }
  });

  it("queries the API on status, never on is_draft", () => {
    expect(expenseListQuery("submitted")).toBe("?status=submitted");
    expect(expenseListQuery("completed")).toBe("?status=completed");
    for (const { value } of STATUS_TABS) {
      expect(expenseListQuery(value)).not.toContain("is_draft");
    }
  });
});
