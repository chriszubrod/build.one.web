import { describe, it, expect } from "vitest";
import billEditSource from "./bills/BillEdit.tsx?raw";
import expenseEditSource from "./expenses/ExpenseEdit.tsx?raw";
import billCreditEditSource from "./bill-credits/BillCreditEdit.tsx?raw";

/**
 * U-465 — no page may rebase a field the user can type into.
 *
 * `useServerOwnedRebase`'s own specs prove the HOOK honours whatever `pick`
 * returns. They say nothing about whether each PAGE's `pick` is restricted to
 * fields the server owns — and that restriction is the entire safety argument.
 *
 * Found by mutation: widening ExpenseEdit's pick onto `memo` passed every other
 * spec in the suite. That is precisely the defect that killed U-460 — it
 * replayed a whole page-load-era body with a fresh token and silently reverted a
 * concurrent editor's changes. A pick that touches a bound input reintroduces it
 * one field at a time.
 *
 * The invariant is checkable without knowing anything entity-specific: a field
 * in `pick` must NOT have a bound input in the same file. `name="…"` is how this
 * codebase binds form inputs (FormField/SelectField), so the two sets must be
 * disjoint.
 */

const PAGES: [string, string][] = [
  ["BillEdit", billEditSource],
  ["ExpenseEdit", expenseEditSource],
  ["BillCreditEdit", billCreditEditSource],
];

/** The keys of the object literal passed as `pick`. */
function pickedFields(source: string): string[] {
  const at = source.indexOf("useServerOwnedRebase(");
  if (at === -1) return [];
  const open = source.indexOf("=> ({", at);
  const close = source.indexOf("}));", open);
  if (open === -1 || close === -1) return [];
  return [...source.slice(open, close).matchAll(/^\s*([a-z_]+)\s*:/gm)].map((m) => m[1]);
}

/** Field names bound to a rendered input in the same file. */
function boundInputs(source: string): string[] {
  return [...source.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]);
}

describe.each(PAGES)("%s — server-owned pick", (name, source) => {
  it("actually calls useServerOwnedRebase", () => {
    /* A page that dropped the call would pass every assertion below vacuously —
       an empty pick is trivially disjoint from anything. */
    expect(source).toContain("useServerOwnedRebase(");
    expect(pickedFields(source).length).toBeGreaterThan(0);
  });

  it("rebases row_version — without it the whole unit is pointless", () => {
    expect(pickedFields(source)).toContain("row_version");
  });

  it("rebases NOTHING the user can type into", () => {
    const picked = pickedFields(source);
    const bound = boundInputs(source);
    const overlap = picked.filter((f) => bound.includes(f));
    expect(
      overlap,
      `${name} rebases ${overlap.join(", ")}, which ${overlap.length === 1 ? "is a" : "are"} ` +
        `bound input${overlap.length === 1 ? "" : "s"} — a refetch would silently revert what the user typed`,
    ).toEqual([]);
  });

  it("stamps seededForRef where it seeds, so the same-entity guard can work", () => {
    /* The guard compares `item.public_id` against this. If a page never sets it,
       the hook returns early forever and the rebase silently does nothing. */
    expect(source).toMatch(/seededForRef\.current\s*=\s*item\.public_id/);
  });
});
