import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

/**
 * U-465 — keep the SERVER-OWNED fields of a seed-once form in step with the
 * server, without ever touching what the user typed.
 *
 * THE PROBLEM IT SOLVES. Every entity edit page in this app seeds its form
 * exactly once — `if (item && !form) setForm({…})` — and nothing re-seeds it.
 * That is correct for the fields a person edits: a refetch landing mid-typing
 * must not rewind their work. It is wrong for the fields the SERVER owns,
 * `row_version` above all. A review transition writes the parent row and bumps
 * ROWVERSION; the page keeps the pre-action token; the next save returns 409;
 * and because the form never re-seeds, it stays wedged until a reload.
 *
 * Reported live on 2026-09-15 on Bill (approve, then Complete, every time), and
 * present on Expense and BillCredit for the same reason — all three render
 * `ReviewTimeline`, which since U-464 invalidates the parent's query, so fresh
 * data arrives and a seed-once form discards it.
 *
 * WHY ONLY SERVER-OWNED FIELDS. U-460 (reverted) tried to fix the same wedge by
 * rebasing the token and REPLAYING the whole form body on a 409. Adversarial
 * review found that silently reverted a concurrent editor's changes — the body
 * was from the stale read. Rebasing a field nobody can author cannot lose
 * anybody's work, which is the entire safety argument for this hook. Pass a
 * `pick` that returns ONLY fields with no bound input.
 *
 * WHY THE SAME-ENTITY GUARD. Edit routes are `/{entity}/:publicId/edit` — one
 * Route — so React reconciles the same component instance when only the param
 * changes, and the form keeps the PREVIOUS entity's values. Taking the new
 * entity's valid token under the old entity's field values is cross-entity
 * corruption, verified by probe during the U-460 review. Keyed route wrappers
 * (U-462) fix the frozen form itself; this guard means a page is safe even
 * before it has one.
 *
 * NOT for `TimeEntryView`, which solved this independently with a hydrate effect
 * that preserves in-progress input when its form is dirty. Same idea, different
 * shape, already correct — do not "unify" it without re-earning its specs.
 */
export function useServerOwnedRebase<T extends { public_id?: string | null }>(
  item: T | null | undefined,
  /** The `public_id` the form was seeded from. Set it where you seed. */
  seededFor: MutableRefObject<string | null>,
  setForm: Dispatch<SetStateAction<Record<string, unknown> | null>>,
  /** Returns ONLY the fields the server owns. Anything with a bound input here
   *  is a lost-update bug, not a rebase. */
  pick: (item: T) => Record<string, unknown>,
): void {
  useEffect(() => {
    if (!item || !seededFor.current) return;
    // Refuse a value from a different entity — see the guard's note above.
    if (item.public_id !== seededFor.current) return;

    const owned = pick(item);
    setForm((prev) => {
      if (!prev) return prev;
      // Bail when nothing moved, so this cannot loop: setForm with a new object
      // every time `item` re-renders would re-render forever.
      const changed = Object.keys(owned).some((k) => prev[k] !== owned[k]);
      return changed ? { ...prev, ...owned } : prev;
    });
    // Keyed on `item` alone, deliberately. `pick`, `setForm` and `seededFor` are
    // stable-by-contract (a literal, a setState, a ref); listing `pick` would
    // re-run on every render because callers pass an inline arrow. Same shape as
    // TimeEntryView's hydrate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);
}
