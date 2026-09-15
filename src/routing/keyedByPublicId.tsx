import { useParams } from "react-router-dom";
import type { ComponentType } from "react";

/**
 * U-462/U-465 — give an entity page a fresh instance per entity.
 *
 * `/{entity}/:publicId/edit` is ONE Route, so React reconciles the SAME
 * component instance when only the param changes. Every edit page in this app
 * seeds its form exactly once — `if (item && !form …)` — and nothing resets it,
 * so navigating from one record's edit page to another left the PREVIOUS
 * record's field values on screen above the NEW record's line items (those
 * reload, because their effect keys on `item`).
 *
 * Keying on `publicId` remounts instead, which resets every piece of per-entity
 * state by construction. The alternative — clearing each state field in an
 * effect — is an enumeration, and an enumeration silently stops being complete
 * the next time someone adds a field.
 *
 * WHY IT MATTERS BEYOND THE CONFUSING SCREEN. `rowVersion` reads
 * `form?.row_version`, so a save carried the PREVIOUS record's token and 409'd —
 * fail-safe. The existing `useEffect(…, [publicId])` that cancels the debounce
 * says so outright: "the stale PUT could not land anyway (RowVersion
 * WHERE-guard)". That is the entire safety argument, and it rests on the token
 * staying stale. U-460 (reverted) made the token fresh and turned this into
 * silent cross-entity corruption — the new record's valid token carrying the old
 * record's field values, verified by probe. `useServerOwnedRebase`'s
 * same-entity guard blocks that specific route in; this removes the landmine.
 *
 * Usage, at module scope in the page's own folder so `routes.tsx` keeps its
 * shape (one component per route, no shell imports):
 *
 *     export default keyedByPublicId(BillEdit);
 */
export function keyedByPublicId<P extends object>(Component: ComponentType<P>) {
  function Keyed(props: P) {
    const { publicId } = useParams<{ publicId: string }>();
    return <Component key={publicId} {...props} />;
  }
  Keyed.displayName = `KeyedByPublicId(${Component.displayName ?? Component.name ?? "Component"})`;
  return Keyed;
}
