import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { serverDiverged } from "./serverDiverged";

/**
 * U-471 — keep the SERVER-OWNED fields of a seed-once form in step with the
 * server, but only when a token rebase cannot authorise a stale body.
 *
 * THE PROBLEM. Every entity edit page in this app seeds its form exactly
 * once — `if (item && !form) setForm({…})` — and nothing re-seeds it. That
 * is correct for the fields a person edits: a refetch landing mid-typing
 * must not rewind their work. It is wrong for the fields the SERVER owns,
 * `row_version` above all. A review transition writes the parent row and
 * bumps ROWVERSION; the page keeps the pre-action token; the next save
 * returns 409; and because the form never re-seeds, it stays wedged until
 * a reload. Reported live on 2026-09-15 on Bill (approve, then Complete,
 * every time), and present on Expense and BillCredit for the same reason.
 *
 * U-464/U-465 copied `row_version` (and `is_draft`) out of any freshly-
 * arrived `item` for the same entity. The safety argument written then —
 * "rebasing a field nobody can author cannot lose anybody's work" — is
 * FALSE. `row_version` is not data; it is the authorisation to overwrite.
 * Refreshing it makes the entire stale body submittable:
 *
 *   1. Editor A opens a bill. Form seeded from S0, token v1.
 *   2. Editor B changes the memo elsewhere and saves. Server is S1, token v2.
 *   3. A's page refetches for ANY reason and receives S1/v2.
 *   4. The hook writes v2 into A's form. A's editable fields still hold S0.
 *   5. A saves. The PUT carries A's STALE BODY under a VALID TOKEN. B's
 *      memo is gone.
 *
 * You cannot close this by filtering refetches. `refetchOnReconnect`
 * defaults to true and is not set anywhere in `src/`; `networkMode:
 * "offlineFirst"` resumes a paused retryer on reconnect even with
 * `refetchOnReconnect: false`. Gate the REBASE, not the refetch.
 *
 * THE INVARIANT. A token rebase is safe if and only if the freshly-arrived
 * record differs from the last-in-sync baseline ONLY in `owned` keys.
 * `seedFrom` is the ONE projection used for the page's initial seed, the
 * baseline, and the comparison — a separate seed literal and pick literal
 * is how those were allowed to disagree. Failure asymmetry: a field
 * wrongly left OUT of `owned` makes us refuse to rebase (degraded). Only
 * a field wrongly put INTO `owned` can corrupt.
 *
 * THE BASELINE IS CAPTURED WHERE THE PAGE SEEDS, via `acceptBaseline`,
 * not lazily in this effect. BillEdit's seed waits on vendor and payment-
 * term lists; the item GET often wins that race. A lazy capture keyed on
 * `[item]` then either never ran (same item identity when the lists
 * arrived) or captured a LATER co-editor state as the baseline and
 * silently authorised a stale body. No baseline means no proof: this
 * effect refuses to rebase rather than inventing one.
 *
 * WHY THE SAME-ENTITY GUARD. Edit routes are `/{entity}/:publicId/edit` —
 * one Route — so React reconciles the same component instance when only
 * the param changes, and the form keeps the PREVIOUS entity's values.
 * Taking the new entity's valid token under the old entity's field values
 * is cross-entity corruption, verified by probe during the U-460 review.
 * Keyed route wrappers (U-462) fix the frozen form itself; this guard
 * means a page is safe even before it has one.
 *
 * TimeEntryView hydrates via an effect rather than a seed-once, and its
 * non-dirty branch already advances token and body together. Its DIRTY
 * branch had the same unguarded-token bug. It reuses `serverDiverged`,
 * not this effect shape — do not force it onto this hook.
 */
export function useServerOwnedRebase<T extends { public_id?: string | null }>({
  item,
  seededFor,
  setForm,
  seedFrom,
  owned,
}: {
  item: T | null | undefined;
  /** The `public_id` the form was seeded from. Set it where you seed. */
  seededFor: MutableRefObject<string | null>;
  setForm: Dispatch<SetStateAction<Record<string, unknown> | null>>;
  /** The same object the page seeds. Owned and editable keys live together. */
  seedFrom: (item: T) => Record<string, unknown>;
  /** Keys a rebase may copy. Anything with a bound input here is a lost-update bug. */
  owned: readonly string[];
}): { diverged: boolean; acceptBaseline: (serverItem: T) => void } {
  const baselineRef = useRef<Record<string, unknown> | null>(null);
  const seedFromRef = useRef(seedFrom);
  seedFromRef.current = seedFrom;
  const ownedRef = useRef(owned);
  ownedRef.current = owned;
  const [diverged, setDiverged] = useState(false);

  const acceptBaseline = useCallback((serverItem: T) => {
    baselineRef.current = seedFromRef.current(serverItem);
  }, []);

  useEffect(() => {
    if (!item || !seededFor.current) return;
    // Refuse a value from a different entity — see the guard's note above.
    if (item.public_id !== seededFor.current) return;
    // No baseline means no proof the rebase is safe. Degrade to the
    // pre-U-464 409 wedge rather than capturing this arrival as "in sync"
    // (that is how a deferred seed authorised a stale body).
    if (baselineRef.current === null) return;

    const projection = seedFromRef.current(item);
    const nextDiverged = serverDiverged(baselineRef.current, projection, ownedRef.current);
    setDiverged((prev) => (prev === nextDiverged ? prev : nextDiverged));
    if (nextDiverged) return;

    const ownedPatch: Record<string, unknown> = {};
    for (const key of ownedRef.current) {
      ownedPatch[key] = projection[key];
    }
    setForm((prev) => {
      if (!prev) return prev;
      // Bail when nothing moved, so this cannot loop: setForm with a new object
      // every time `item` re-renders would re-render forever.
      const changed = Object.keys(ownedPatch).some((k) => prev[k] !== ownedPatch[k]);
      return changed ? { ...prev, ...ownedPatch } : prev;
    });
    // Keyed on `item` alone, deliberately. Callers pass an inline `seedFrom`
    // (BillEdit's closes over `fullVendors` / `fullPaymentTerms`, which change
    // as those lists load) and a fresh `owned: [...]` array every render;
    // `setForm` is a setState dispatcher. Listing any of them would re-run
    // this on every render. They are read through refs written during render
    // so the effect sees the latest projection without re-firing. `seededFor`
    // is a ref stamped at the seed site — it is not a render input. The
    // baseline is captured there via `acceptBaseline`, not here, so a later
    // `item` cannot become the baseline by arriving first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  return { diverged, acceptBaseline };
}
