/** Render-local client identity for line-item rows — NEVER sent to the API.
 *
 * Shared minter for ExpenseEdit, BillCreditEdit, and InvoiceEdit. BillEdit.tsx:66,
 * BillCreate.tsx:44, and TimeEntryView.tsx:128 still mint locally — tracked follow-up
 * (web TODO.md:9). When migrating BillEdit, also replace BillEdit.tsx:216 (hydrate
 * currently calls `newLineItemUid()` per row) with `persistedLineItemUid(li.public_id)`;
 * sharing this module alone leaves the remount-on-refetch defect in place.
 *
 * Invariant: a row's uid must never change while that row exists in the table.
 * React keys on uid; remounting destroys focus, selection, and IME state.
 *
 * - NEW (unsaved) row → `newLineItemUid()` → `li-uid-${n}` (minted).
 * - Row already in state → its EXISTING uid, reused (matched by public_id on re-hydrate).
 * - Row new to this state → `persistedLineItemUid(public_id)` → `li-pid-${public_id}`
 *   (derived; first hydrate only).
 *
 * Prefixes `li-uid-` vs `li-pid-` keep the two id spaces disjoint. */
let n = 0;

export function newLineItemUid(): string {
  return `li-uid-${++n}`;
}

export function persistedLineItemUid(publicId: string): string {
  return `li-pid-${publicId}`;
}

/** On re-hydrate, look the incoming row up by public_id and reuse its existing uid,
 * so a row created-and-saved in this session keeps its minted li-uid-N instead of
 * flipping to li-pid-X and remounting. */
export function existingUidsByPublicId(
  rows: { uid: string; public_id?: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.public_id) {
      map.set(row.public_id, row.uid);
    }
  }
  return map;
}
