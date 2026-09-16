import { describe, it, expect } from "vitest";
import billEditSource from "./bills/BillEdit.tsx?raw";
import expenseEditSource from "./expenses/ExpenseEdit.tsx?raw";
import billCreditEditSource from "./bill-credits/BillCreditEdit.tsx?raw";
import timeEntryViewSource from "./time-entry/TimeEntryView.tsx?raw";

/**
 * U-471 — three directions of the owned / bound-input / baseline invariant.
 *
 * Direction A (U-465): a field in `owned` must NOT have a bound input in
 * the same file. Widening `owned` onto `memo` is exactly the defect that
 * killed U-460 — a refetch would copy a co-editor's (or the user's own)
 * field under a fresh token.
 *
 * Direction B (U-471): every `name="…"` bound input in a page must appear
 * as a key in that page's `seedFrom` projection. A bound input missing
 * from the projection is invisible to the base test, so a co-editor's
 * change of that field would look like an owned-only arrival and the
 * token would rebase under a stale body. (ExpenseEdit / BillCreditEdit
 * project `vendor_public_id` as the constant `""` — the key is present
 * so this scan passes, but a co-editor change of vendor is invisible
 * because the projected value never differs.)
 *
 * Direction C (U-471): every page that calls `useServerOwnedRebase` MUST
 * call `acceptBaseline` inside its seed-once block. The baseline is
 * captured where the page seeds, not lazily in the hook. A gated seed
 * (BillEdit waits on vendor and payment-term lists) with a lazy `[item]`
 * capture either misses the seed (same item identity) or captures a
 * later co-editor as "in sync" and silently authorises a stale body.
 *
 * `name="…"` is how this codebase binds form inputs (FormField/SelectField).
 */

const HOOK_PAGES: [string, string][] = [
  ["BillEdit", billEditSource],
  ["ExpenseEdit", expenseEditSource],
  ["BillCreditEdit", billCreditEditSource],
];

/** The keys of the `const seedFrom = (x) => ({ … })` projection. */
function seedFromFields(source: string): string[] {
  const def = source.indexOf("const seedFrom =");
  if (def === -1) return [];
  const open = source.indexOf("=> ({", def);
  const close = source.indexOf("})", open);
  if (open === -1 || close === -1) return [];
  return [...source.slice(open, close).matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
}

/** The strings listed in `owned: [...]`. */
function ownedFields(source: string): string[] {
  const at = source.indexOf("useServerOwnedRebase(");
  if (at === -1) return [];
  const ownedAt = source.indexOf("owned:", at);
  if (ownedAt === -1) return [];
  const close = source.indexOf("]", ownedAt);
  if (close === -1) return [];
  return [...source.slice(ownedAt, close).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

/** Field names bound to a rendered input in the same file. */
function boundInputs(source: string): string[] {
  return [...source.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]);
}

/** Body of the seed-once `if (item && !form …) { … }`. */
function seedBlock(source: string): string {
  const ifAt = source.search(/if \(item && !form/);
  if (ifAt === -1) return "";
  const open = source.indexOf("{", ifAt);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return "";
}

describe.each(HOOK_PAGES)("%s — server-owned pick", (name, source) => {
  it("actually calls useServerOwnedRebase", () => {
    /* A page that dropped the call would pass every assertion below vacuously —
       an empty owned set is trivially disjoint from anything. */
    expect(source).toContain("useServerOwnedRebase(");
    expect(ownedFields(source).length).toBeGreaterThan(0);
    expect(seedFromFields(source).length).toBeGreaterThan(0);
  });

  it("rebases row_version — without it the whole unit is pointless", () => {
    expect(ownedFields(source)).toContain("row_version");
  });

  it("rebases NOTHING the user can type into", () => {
    const owned = ownedFields(source);
    const bound = boundInputs(source);
    const overlap = owned.filter((f) => bound.includes(f));
    expect(
      overlap,
      `${name} rebases ${overlap.join(", ")}, which ${overlap.length === 1 ? "is a" : "are"} ` +
        `bound input${overlap.length === 1 ? "" : "s"} — a refetch would silently revert what the user typed`,
    ).toEqual([]);
  });

  it("projects every bound input in seedFrom, so the base test can see a co-editor", () => {
    const projected = seedFromFields(source);
    const bound = boundInputs(source);
    const missing = bound.filter((f) => !projected.includes(f));
    expect(
      missing,
      `${name} binds ${missing.join(", ")} but seedFrom does not project ` +
        `${missing.length === 1 ? "it" : "them"} — a co-editor change would be invisible to the base test`,
    ).toEqual([]);
  });

  it("stamps seededForRef where it seeds, so the same-entity guard can work", () => {
    /* The guard compares `item.public_id` against this. If a page never sets it,
       the hook returns early forever and the rebase silently does nothing. */
    expect(source).toMatch(/seededForRef\.current\s*=\s*item\.public_id/);
  });

  it("captures the baseline in the same seed block as setForm (direction C)", () => {
    /* acceptBaseline(updated) after a save is a different moment. The P0
       shipped because the INITIAL seed never captured, and a later item
       became the baseline. Scanning the whole file would miss that. */
    const block = seedBlock(source);
    expect(block, `${name} has no seed-once block`).toContain("setForm(seedFrom(item))");
    expect(
      block,
      `${name} seeds without acceptBaseline(item) — a gated seed will inherit the P0 silently`,
    ).toContain("acceptBaseline(item)");
  });
});

/**
 * TimeEntryView is the fourth case and is NOT a copy-paste of the hook
 * pages: it hydrates via an effect and reuses `serverDiverged` on the
 * dirty branch. The same two directions apply to `seedTimeEntryHeader`
 * and `TIME_ENTRY_OWNED`.
 */
describe("TimeEntryView — server-owned pick", () => {
  const source = timeEntryViewSource;

  function timeEntryProjected(): string[] {
    const at = source.indexOf("function seedTimeEntryHeader");
    if (at === -1) return [];
    const open = source.indexOf("return {", at);
    const close = source.indexOf("};", open);
    if (open === -1 || close === -1) return [];
    return [...source.slice(open, close).matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
  }

  function timeEntryOwned(): string[] {
    const at = source.indexOf("TIME_ENTRY_OWNED");
    const open = source.indexOf("[", at);
    const close = source.indexOf("]", open);
    if (at === -1 || open === -1 || close === -1) return [];
    return [...source.slice(open, close).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  }

  it("uses serverDiverged on the dirty branch rather than an unguarded token copy", () => {
    expect(source).toContain("serverDiverged(");
    expect(source).toContain("function seedTimeEntryHeader");
    expect(source).toContain("TIME_ENTRY_OWNED");
  });

  it("rebases row_version — without it the whole unit is pointless", () => {
    expect(timeEntryOwned()).toContain("row_version");
  });

  it("rebases NOTHING the user can type into", () => {
    const owned = timeEntryOwned();
    const bound = boundInputs(source);
    const overlap = owned.filter((f) => bound.includes(f));
    expect(overlap).toEqual([]);
  });

  it("projects every bound input in seedTimeEntryHeader, so the base test can see a co-editor", () => {
    const projected = timeEntryProjected();
    const bound = boundInputs(source);
    const missing = bound.filter((f) => !projected.includes(f));
    expect(missing).toEqual([]);
  });
});
