import BillEdit from "./BillEdit";
import { keyedByPublicId } from "../../routing/keyedByPublicId";

/**
 * U-462 — give BillEdit a fresh instance per bill.
 *
 * `/bill/:publicId/edit` is one Route, so React reconciles the SAME BillEdit
 * instance when only the param changes. BillEdit seeds its header form exactly
 * once — `if (item && !form …)` — and nothing ever resets it, so navigating
 * from one bill's edit page to another left the previous bill's vendor, dates,
 * number and memo on screen above the NEW bill's line items (those reload,
 * because their effect keys on `item`).
 *
 * Keying on `publicId` remounts instead, which resets every piece of state by
 * construction. The alternative — clearing `form`, `lineItems`,
 * `lineItemsLoaded`, `origLineItemPublicIds`, `attachmentPublicId`,
 * `persistedLineTotalRef`, `headerDirtyRef` and `saveError` in an effect — is an
 * enumeration, and an enumeration silently stops being complete the next time
 * someone adds a field.
 *
 * WHY IT MATTERED ENOUGH TO FIX. Today the stale header is confusing rather
 * than corrupting: `rowVersion` reads `form?.row_version`, so a save carries the
 * PREVIOUS bill's token and 409s. The existing `useEffect(… , [publicId])` that
 * cancels the debounce says so outright — "the stale PUT could not land anyway
 * (RowVersion WHERE-guard)". That is the entire safety argument, and it rests on
 * the token staying stale. U-460 (reverted) changed the token source to the live
 * query data and turned this into silent cross-bill corruption: bill B's valid
 * token carrying bill A's field values, verified by probe. The landmine is the
 * frozen form, not the token.
 *
 * U-465 moved this onto the shared `keyedByPublicId` factory and gave Expense
 * and BillCredit the same treatment. NOT InvoiceEdit — it is a dead file, not
 * routed or imported anywhere, parked pending U-128. NOT TimeEntryView — it
 * hydrates via an effect keyed on `entry?.public_id`, so a param change
 * re-seeds only when the header is NOT dirty (the dirty branch keeps the
 * in-progress form and gates the token with `serverDiverged`). It does not
 * have the seed-once frozen-form landmine this factory exists for.
 */
export default keyedByPublicId(BillEdit);
