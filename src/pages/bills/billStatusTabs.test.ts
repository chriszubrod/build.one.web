import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATUS_TAB,
  STATUS_TABS,
  billListQuery,
  isStatusTab,
  resolveStatusTab,
} from "./billStatusTabs";
import { DOCUMENT_STATUS_LABELS } from "../../shared/documentLifecycle";

describe("bills status tabs (U-451)", () => {
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
    // Deliberate (Chris, 2026-09-11). Pinned because re-adding it is a product
    // decision, not a tidy-up — with no All tab there is no single view of
    // every in-flight bill; U-700 defaults the list to the draft tab instead.
    expect(STATUS_TABS.some((t) => t.value === ("" as string))).toBe(false);
    expect(STATUS_TABS.some((t) => /all/i.test(t.label))).toBe(false);
  });

  it("labels the tabs the same way the badges do", () => {
    // A tab reading "In Review" over rows badged "Submitted" is the kind of
    // mismatch nobody reports and everybody distrusts.
    for (const tab of STATUS_TABS) {
      expect(tab.label).toBe(DOCUMENT_STATUS_LABELS[tab.value]);
    }
  });

  it("defaults to draft when the URL carries no status (U-700)", () => {
    expect(DEFAULT_STATUS_TAB).toBe("draft");
    expect(resolveStatusTab(null)).toBe("draft");
    expect(resolveStatusTab(undefined)).toBe("draft");
    expect(resolveStatusTab("")).toBe("draft");
  });

  it("respects an explicit ?status=in_review", () => {
    expect(resolveStatusTab("in_review")).toBe("in_review");
  });

  it("falls back rather than forwarding junk the API would reject", () => {
    // The API 422s an unknown status (U-445) instead of silently returning
    // everything, so a stale or hand-edited URL must be normalised here.
    expect(resolveStatusTab("billed")).toBe("draft");
    expect(resolveStatusTab("Draft")).toBe("draft"); // case matters
    expect(resolveStatusTab("finalized")).toBe("draft"); // the OLD value
    expect(resolveStatusTab("'; DROP TABLE Bill--")).toBe("draft");
  });

  it("round-trips every legal tab", () => {
    for (const { value } of STATUS_TABS) {
      expect(resolveStatusTab(value)).toBe(value);
      expect(isStatusTab(value)).toBe(true);
    }
  });

  it("queries the API on status, never on is_draft", () => {
    // THE regression to prevent. `?is_draft=` expressed two of six states, so
    // Submitted / In Review / Declined were indistinguishable — every one of
    // them was "draft". A tab that silently fell back to it would show the same
    // 42 rows under three different headings.
    expect(billListQuery("submitted")).toBe("?status=submitted");
    expect(billListQuery("completed")).toBe("?status=completed");
    for (const { value } of STATUS_TABS) {
      expect(billListQuery(value)).not.toContain("is_draft");
    }
  });
});
