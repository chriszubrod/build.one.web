/**
 * U-461 — what may be written to the persisted (IndexedDB) query cache.
 *
 * Extracted from `main.tsx` so the policy is testable. It used to be an inline
 * closure in the `PersistQueryClientProvider` options, which meant the rule that
 * caused a production incident had no spec of its own.
 *
 * THE INCIDENT (2026-09-15). A reviewer approved a Bill in the web UI. Advancing
 * a review writes the parent Bill row, bumping its ROWVERSION, so the open edit
 * page's optimistic-concurrency token went stale and every save returned 409.
 * That much is ordinary and recoverable — you reload.
 *
 * **The reload did not help.** `["item", "/api/v1/get/bill/…"]` was persisted to
 * IndexedDB for SEVEN DAYS, so the reload rehydrated the same pre-approval bill
 * from disk. `BillEdit` seeds its form from the first `item` it sees and never
 * re-seeds (`if (item && !form …)`), so the fresh payload arriving moments later
 * was discarded. Only a successful save would have replaced the cached entry,
 * and no save could succeed. The page was wedged for up to 24 hours.
 *
 * THE RULE: **a single-entity payload is never persisted.** Its `row_version` is
 * a write token, and a token read off a disk cache of unknown age can serve a
 * read but never a write. Lists, lookups and identity still persist, so the PWA
 * keeps offline browsing down to the list level — what it loses is "browse a
 * last-viewed DETAIL screen offline" (docs/pwa-tier2.md). That trade was made
 * deliberately: an edit page that silently stops saving is worse than a detail
 * screen that needs a connection.
 *
 * WHY NOT just shorten the bucket: an age limit shortens the window, it does not
 * close it. A one-hour-old token is exactly as stale as a seven-day-old one the
 * moment somebody else writes the row.
 */

/** Query-key head for a single entity read — `entityItemKey` in hooks/useEntity. */
export const ITEM_KEY_PREFIX = "item";

const ONE_HOUR_MS = 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * How long a persisted payload stays usable, by query-key head.
 *
 * `me` and `lookups` are short because RBAC and dropdown data change underneath
 * us and stale identity is risky. Everything else gets a week — long enough for
 * a weekend offline (docs/pwa-tier2.md).
 */
export function maxAgeForQuery(queryKey: readonly unknown[]): number {
  const head = queryKey[0];
  if (head === "me") return ONE_DAY_MS;
  if (head === "lookups") return ONE_DAY_MS;
  return 7 * ONE_DAY_MS;
}

/** The minimum shape of a React Query `Query` this policy inspects. */
export interface DehydrationCandidate {
  queryKey: readonly unknown[];
  state: { status: string; dataUpdatedAt?: number };
}

/**
 * Whether a query may be written to the persisted cache.
 *
 * Order matters. The entity-item exclusion is checked BEFORE the age test so it
 * cannot be reintroduced by anyone adjusting the age buckets — the rule is
 * "never", not "not for very long".
 */
export function shouldDehydrateQuery(
  query: DehydrationCandidate,
  now: number = Date.now(),
): boolean {
  // Don't persist queries that errored or have no data.
  if (query.state.status !== "success") return false;
  if (!query.state.dataUpdatedAt) return false;

  // U-461: never persist a SINGLE-ENTITY payload. It carries a `row_version`,
  // and an edit page that seeds its write token from a rehydrated payload of
  // unknown age is the wedge described at the top of this file. Lists are fine:
  // nothing writes from a list row.
  if (query.queryKey[0] === ITEM_KEY_PREFIX) return false;

  return now - query.state.dataUpdatedAt < maxAgeForQuery(query.queryKey);
}
