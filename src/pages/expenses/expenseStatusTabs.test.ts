import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATUS_TAB,
  STATUS_TABS,
  expenseListPath,
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
    // tab there is no single view of every expense.
    expect(STATUS_TABS.some((t) => t.value === ("" as string))).toBe(false);
    expect(STATUS_TABS.some((t) => /all/i.test(t.label))).toBe(false);
  });

  it("labels the tabs the same way the badges do", () => {
    for (const tab of STATUS_TABS) {
      expect(tab.label).toBe(EXPENSE_STATUS_LABELS[tab.value]);
    }
  });

  it("defaults to draft, matching Bills (Chris, 2026-11-02, U-752)", () => {
    expect(DEFAULT_STATUS_TAB).toBe("draft");
  });

  it("falls back to draft on junk or null rather than forwarding it (U-479, U-752)", () => {
    expect(resolveStatusTab(null)).toBe("draft");
    expect(resolveStatusTab(undefined)).toBe("draft");
    expect(resolveStatusTab("")).toBe("draft");
    expect(resolveStatusTab("billed")).toBe("draft");
    expect(resolveStatusTab("Draft")).toBe("draft"); // case matters — junk, not the tab
    expect(resolveStatusTab("finalized")).toBe("draft");
    expect(resolveStatusTab("'; DROP TABLE Expense--")).toBe("draft");
  });

  it("an explicit status still wins over the default", () => {
    expect(resolveStatusTab("completed")).toBe("completed");
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

describe("expenseListPath — the list URL that keeps the user's tab", () => {
  it("carries the expense's own status so Back lands on that status's tab", () => {
    expect(expenseListPath("draft")).toBe("/expense/list?status=draft");
    expect(expenseListPath("in_review")).toBe("/expense/list?status=in_review");
    expect(expenseListPath("completed")).toBe("/expense/list?status=completed");
  });

  it("falls back to the default tab for an unknown or missing status, like the URL param does", () => {
    expect(expenseListPath(null)).toBe("/expense/list?status=draft");
    expect(expenseListPath(null)).toBe(`/expense/list?status=${DEFAULT_STATUS_TAB}`);
    expect(expenseListPath("bogus")).toBe(`/expense/list?status=${DEFAULT_STATUS_TAB}`);
  });
});
