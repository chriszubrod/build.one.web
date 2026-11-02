import { describe, it, expect } from "vitest";
import { createStatusTabs, DOCUMENT_STATUS_TABS } from "./statusTabs";
import { DOCUMENT_STATUS_LABELS } from "../../shared/documentLifecycle";

describe("createStatusTabs (U-752)", () => {
  it("offers the six canonical lifecycle states, in lifecycle order, with badge labels", () => {
    const tabs = createStatusTabs({ defaultTab: "draft", listBasePath: "/x/list" });
    expect(tabs.STATUS_TABS.map((t) => t.value)).toEqual([
      "draft", "submitted", "in_review", "approved", "declined", "completed",
    ]);
    expect(tabs.STATUS_TABS.map((t) => t.label)).toEqual([
      "Draft", "Submitted", "In Review", "Approved", "Declined", "Completed",
    ]);
    for (const t of tabs.STATUS_TABS) expect(t.label).toBe(DOCUMENT_STATUS_LABELS[t.value]);
  });

  it("has no 'All' tab", () => {
    expect(DOCUMENT_STATUS_TABS.some((t) => /all/i.test(t.label) || (t.value as string) === "")).toBe(false);
  });

  it("hands each caller its own STATUS_TABS array (a mutation in one page cannot leak)", () => {
    const a = createStatusTabs({ defaultTab: "draft", listBasePath: "/a" });
    const b = createStatusTabs({ defaultTab: "draft", listBasePath: "/b" });
    expect(a.STATUS_TABS).not.toBe(b.STATUS_TABS);
    expect(a.STATUS_TABS[0]).not.toBe(b.STATUS_TABS[0]);
  });

  it.each(["draft", "completed", "in_review"] as const)(
    "resolves missing or junk params to the configured default (%s)",
    (defaultTab) => {
      const tabs = createStatusTabs({ defaultTab, listBasePath: "/x/list" });
      expect(tabs.DEFAULT_STATUS_TAB).toBe(defaultTab);
      for (const junk of [null, undefined, "", "Draft", "billed", "all"]) {
        expect(tabs.resolveStatusTab(junk)).toBe(defaultTab);
        expect(tabs.isStatusTab(junk)).toBe(false);
      }
      for (const { value } of tabs.STATUS_TABS) {
        expect(tabs.isStatusTab(value)).toBe(true);
        expect(tabs.resolveStatusTab(value)).toBe(value);
      }
    },
  );

  it("builds the API query on status, never is_draft", () => {
    const tabs = createStatusTabs({ defaultTab: "draft", listBasePath: "/x/list" });
    expect(tabs.listQuery("submitted")).toBe("?status=submitted");
    for (const { value } of tabs.STATUS_TABS) expect(tabs.listQuery(value)).not.toContain("is_draft");
  });

  it("builds the list path on the configured base, normalising the status", () => {
    const tabs = createStatusTabs({ defaultTab: "completed", listBasePath: "/expense/list" });
    expect(tabs.listPath("declined")).toBe("/expense/list?status=declined");
    expect(tabs.listPath(null)).toBe("/expense/list?status=completed");
    expect(tabs.listPath("bogus")).toBe("/expense/list?status=completed");
  });
});
