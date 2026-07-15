import { decodeJwtPayload } from "../api/jwt";

/**
 * Cross-tab auth-sync predicate.
 *
 * The `storage` event fires ONLY in OTHER tabs (never the tab that wrote
 * localStorage). We hard-reload — NOT `setUsername` — on a real auth
 * IDENTITY transition so the boot-time per-user React-Query persister
 * keying in `main.tsx` (`bo.rq.v1.<uid>`) re-runs under the new identity.
 * A naive `setUsername` would swap identity without re-keying and violate
 * the NON-NEGOTIABLE multi-user cache-bleed contract (`cacheCleanup.ts`).
 *
 * "Identity" is the access token's `uid` claim — the SAME value `main.tsx`
 * keys the persister on (`getUserPublicIdFromStorage`), NOT the `username`
 * string. Keying the reload on `uid` means it fires exactly when the
 * boot-time persister key would differ, and it does NOT fire on a same-user
 * access-token REFRESH: `client.ts` rewrites `access_token` on every refresh
 * (~hourly / on 401) with the SAME uid, so reloading on it would needlessly
 * discard unsaved work on non-auto-save surfaces (e.g. Bills forms).
 *
 * Reload iff (after excluding non-localStorage areas and no-op writes):
 *   - `username` changed — belt-and-suspenders: login / logout /
 *     login-as-different-user all rewrite it, OR
 *   - `access_token` was REMOVED (`newValue === null`, logout), OR
 *   - the `access_token`'s decoded `uid` claim changed — login-as-other or a
 *     same-username/new-uid swap. A same-uid REFRESH is explicitly NOT a
 *     reload (the bug this predicate fixes).
 *
 * Also NOT a reload: sessionStorage writes, unrelated keys, no-op writes.
 */
export function shouldReloadOnStorage(
  e: Pick<StorageEvent, "key" | "oldValue" | "newValue" | "storageArea">,
): boolean {
  // Exclude sessionStorage and any non-localStorage area.
  if (e.storageArea !== window.localStorage) return false;
  // Ignore no-op writes (same value written back).
  if (e.oldValue === e.newValue) return false;
  // Any username transition is treated as an identity change.
  if (e.key === "username") return true;
  if (e.key === "access_token") {
    // Removal (logout) always reloads — belt-and-suspenders.
    if (e.newValue === null) return true;
    // Otherwise reload only when the decoded identity (uid claim) changes —
    // a real login-as-other / same-username-new-uid swap. A same-user REFRESH
    // keeps the same uid and must NOT reload.
    return decodeJwtPayload(e.oldValue)?.uid !== decodeJwtPayload(e.newValue)?.uid;
  }
  return false;
}
