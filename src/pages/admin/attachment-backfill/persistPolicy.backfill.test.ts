import { describe, it, expect } from "vitest";
import { ATTACHMENT_BACKFILL_KEY_PREFIX, shouldDehydrateQuery } from "../../../persistPolicy";

// Fix 8: runs/facets must never be rehydrated from IndexedDB — a stale facet
// snapshot would seed the default batch on a cold boot.
describe("persistPolicy — attachment-backfill is never persisted", () => {
  const now = 1_000_000_000;
  const fresh = (queryKey: unknown[]) => ({ queryKey, state: { status: "success", dataUpdatedAt: now - 1 } });

  it("uses the page's query-key head", () => {
    expect(ATTACHMENT_BACKFILL_KEY_PREFIX).toBe("attachment-backfill");
  });

  it.each([[["attachment-backfill", "runs"]], [["attachment-backfill", "facets", "run-1"]]])(
    "refuses a fresh successful %j",
    (key) => {
      expect(shouldDehydrateQuery(fresh(key), now)).toBe(false);
    },
  );

  it("still persists an ordinary list of the same age (control)", () => {
    expect(shouldDehydrateQuery(fresh(["list", "/api/v1/list/vendor"]), now)).toBe(true);
  });
});
