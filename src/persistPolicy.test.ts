import { describe, it, expect } from "vitest";
import policySource from "./persistPolicy.ts?raw";
import mainSource from "./main.tsx?raw";
import {
  ONE_DAY_MS,
  maxAgeForQuery,
  shouldDehydrateQuery,
  type DehydrationCandidate,
} from "./persistPolicy";

/**
 * U-461 — a single-entity payload is never written to the persisted cache.
 *
 * THE INCIDENT (2026-09-15, production). A reviewer approved a Bill in the web
 * UI. The review advance wrote the parent Bill row and bumped its ROWVERSION, so
 * the open edit page's concurrency token went stale and saves began returning
 * 409. Ordinary so far — you reload.
 *
 * The reload did not help. `["item", "/api/v1/get/bill/…"]` was persisted to
 * IndexedDB for SEVEN DAYS, so the reload rehydrated the same pre-approval bill
 * from disk; `BillEdit` seeds its form from the first `item` it sees and never
 * re-seeds, so the fresh payload arriving moments later was discarded. Only a
 * successful save would replace the cached entry, and no save could succeed.
 *
 * A previous attempt at this (U-460, REVERTED) tried to fix it from the token
 * side — rebase the token and retry the write once on a 409. Adversarial review
 * found that made things worse: the retry re-sent a page-load-era body with a
 * fresh token, silently reverting a concurrent editor's changes, and reading a
 * live token under a form that never resets on navigation turned a fail-safe 409
 * into cross-bill corruption. Both were verified by probe. The lesson that
 * produced THIS unit: do not make a stale read writable — stop serving the stale
 * read.
 */

function q(queryKey: readonly unknown[], over: Partial<DehydrationCandidate["state"]> = {}): DehydrationCandidate {
  return { queryKey, state: { status: "success", dataUpdatedAt: Date.now(), ...over } };
}

describe("shouldDehydrateQuery — the U-461 rule", () => {
  it("NEVER persists a single-entity payload, however fresh", () => {
    const now = Date.now();
    expect(shouldDehydrateQuery(q(["item", "/api/v1/get/bill/bill-1"], { dataUpdatedAt: now }), now))
      .toBe(false);
  });

  it("refuses the entity item even one millisecond old", () => {
    /* The rule is "never", not "not for very long". An age limit shortens the
       window; it does not close it — a one-hour-old row_version is exactly as
       stale as a seven-day-old one the moment somebody else writes the row. */
    const now = 1_000_000;
    expect(shouldDehydrateQuery(q(["item", "/api/v1/get/bill/b"], { dataUpdatedAt: now - 1 }), now))
      .toBe(false);
  });

  it("checks the item rule BEFORE the age test, so age-bucket edits cannot reopen it", () => {
    /* If the exclusion were applied after the age comparison, anyone adding a
       bucket for "item" would silently restore persistence. */
    const now = Date.now();
    const src = policySource;
    const itemCheck = src.indexOf('queryKey[0] === ITEM_KEY_PREFIX');
    const ageCheck = src.indexOf("now - query.state.dataUpdatedAt");
    expect(itemCheck).toBeGreaterThan(-1);
    expect(ageCheck).toBeGreaterThan(-1);
    expect(itemCheck).toBeLessThan(ageCheck);
    // and behaviourally: a brand-new item is still refused
    expect(shouldDehydrateQuery(q(["item", "/x"], { dataUpdatedAt: now }), now)).toBe(false);
  });

  it("STILL persists lists — nothing writes from a list row", () => {
    /* The PWA keeps offline browsing down to the list level. What U-461 gives
       up is "browse a last-viewed DETAIL screen offline" (docs/pwa-tier2.md) —
       a deliberate trade against an edit page that silently stops saving. */
    const now = Date.now();
    expect(shouldDehydrateQuery(q(["list", "/api/v1/get/bills"], { dataUpdatedAt: now }), now))
      .toBe(true);
  });

  it("still persists identity and lookups", () => {
    const now = Date.now();
    expect(shouldDehydrateQuery(q(["me"], { dataUpdatedAt: now }), now)).toBe(true);
    expect(shouldDehydrateQuery(q(["lookups", "vendors"], { dataUpdatedAt: now }), now)).toBe(true);
  });

  it("still drops errored and dataless queries", () => {
    const now = Date.now();
    expect(shouldDehydrateQuery(q(["list", "/x"], { status: "error" }), now)).toBe(false);
    expect(shouldDehydrateQuery(q(["list", "/x"], { status: "pending" }), now)).toBe(false);
    expect(shouldDehydrateQuery(q(["list", "/x"], { dataUpdatedAt: 0 }), now)).toBe(false);
    expect(shouldDehydrateQuery(q(["list", "/x"], { dataUpdatedAt: undefined }), now)).toBe(false);
  });

  it("still enforces the per-bucket ages it did before", () => {
    const now = 100 * ONE_DAY_MS;
    // identity/lookups: 24h
    expect(shouldDehydrateQuery(q(["me"], { dataUpdatedAt: now - ONE_DAY_MS + 1 }), now)).toBe(true);
    expect(shouldDehydrateQuery(q(["me"], { dataUpdatedAt: now - ONE_DAY_MS - 1 }), now)).toBe(false);
    // lists: 7d
    expect(shouldDehydrateQuery(q(["list", "/x"], { dataUpdatedAt: now - 7 * ONE_DAY_MS + 1 }), now)).toBe(true);
    expect(shouldDehydrateQuery(q(["list", "/x"], { dataUpdatedAt: now - 7 * ONE_DAY_MS - 1 }), now)).toBe(false);
  });
});

describe("maxAgeForQuery", () => {
  it("keeps the documented buckets", () => {
    expect(maxAgeForQuery(["me"])).toBe(ONE_DAY_MS);
    expect(maxAgeForQuery(["lookups", "vendors"])).toBe(ONE_DAY_MS);
    expect(maxAgeForQuery(["list", "/api/v1/get/bills"])).toBe(7 * ONE_DAY_MS);
  });
});

describe("main.tsx wiring", () => {
  /* The policy is worthless if nothing applies it, and worse than worthless if
     the persisted blob already on disk is still restored. Both halves pinned
     here because a unit that shipped only the first half would leave every
     existing user — including the one whose bill was wedged — exactly as stuck. */
  const main = mainSource;
  const executable = main
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

  it("uses the extracted policy rather than an inline closure", () => {
    /* Asserted as SHORTHAND (`shouldDehydrateQuery,`) rather than "the name
       appears somewhere". A mutation replacing it with
       `shouldDehydrateQuery: (query: any) => …` survived the first version of
       this spec, because the name still appeared and the old regex only matched
       an UNTYPED arrow. Shorthand is the only form that cannot be a different
       function wearing the right key. */
    expect(executable).toMatch(/from "\.\/persistPolicy"/);
    expect(executable).toMatch(/^\s*shouldDehydrateQuery,\s*$/m);
    expect(executable).not.toMatch(/shouldDehydrateQuery\s*:/);
  });

  it("bumped PERSISTER_BUSTER, so entries already on disk are discarded", () => {
    /* `shouldDehydrateQuery` filters on WRITE. Without a buster bump the first
       load after this deploy would still RESTORE the stale entry it was meant
       to eliminate, and the wedge would survive its own fix. */
    const m = executable.match(/const PERSISTER_BUSTER = "([^"]+)"/);
    expect(m).toBeTruthy();
    expect(m![1]).not.toBe("bo-rq-v1");
  });
});
