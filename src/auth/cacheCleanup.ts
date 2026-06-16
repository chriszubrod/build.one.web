import { del } from "idb-keyval";
import { getUserPublicIdFromStorage } from "../api/jwt";

/**
 * Names of all caches the SW + React Query persist client own. Keep this
 * list in sync with src/sw.ts and src/main.tsx — any new runtime cache
 * registered in the SW needs to be listed here so logout clears it.
 */
const SW_CACHE_NAMES = [
  "bo-api-reads-v1", // Tier 2 NetworkFirst cache (src/sw.ts)
];

const PERSISTER_KEY_PREFIX = "bo.rq.v1."; // must match src/main.tsx

/**
 * Clears every per-user storage surface — the IndexedDB-backed React
 * Query persister, the SW runtime caches, and (transitively, via the
 * caller) the in-memory React Query cache.
 *
 * Awaited because the multi-user-state-bleed contract is non-negotiable:
 * if the user navigates to /login before this completes, a different
 * user signing in would risk seeing the prior user's cached payloads.
 *
 * Best-effort per surface — individual delete failures are logged but
 * don't block logout. The final hard reload is the ultimate guarantee
 * that the next user starts from a fresh tab.
 */
export async function clearAllUserScopedStorage(): Promise<void> {
  // 1. IndexedDB persister entries — clear both the current user's key
  //    and the "guest" key (might hold unauthenticated lookup data).
  const currentUserId = getUserPublicIdFromStorage();
  const keysToDelete: string[] = [`${PERSISTER_KEY_PREFIX}guest`];
  if (currentUserId) {
    keysToDelete.push(`${PERSISTER_KEY_PREFIX}${currentUserId}`);
  }
  await Promise.all(
    keysToDelete.map((key) =>
      del(key).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn(`[cacheCleanup] failed to delete persister key ${key}:`, err);
      }),
    ),
  );

  // 2. Service worker runtime caches.
  if (typeof caches !== "undefined") {
    await Promise.all(
      SW_CACHE_NAMES.map((name) =>
        caches.delete(name).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn(`[cacheCleanup] failed to delete SW cache ${name}:`, err);
        }),
      ),
    );
  }
}
