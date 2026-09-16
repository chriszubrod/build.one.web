# PWA Tier 2 — Offline Reads

Tier 2 builds on Tier 1's shell-only PWA by adding persistent
read-caching: cold-launch with last-synced data, instant navigate-back
from disk, automatic refresh on reconnect. Writes still require a live
network (a typed `OfflineError` + "Not saved — you are offline" toast
surfaces the failure). Tier 3 (local-first writes with an
`Idempotency-Key`-backed outbox) is conditional on a decision gate and
NOT shipped here.

---

## What works after Tier 2 (in addition to Tier 1)

| Capability | Works offline? |
|---|---|
| Launch app + render shell | ✅ (Tier 1) |
| Browse last-viewed lists (TimeEntries, Labor) | ✅ from IndexedDB cache |
| Browse last-viewed detail screens | ❌ **since U-461** — see below |
| See dropdowns (vendors, projects, SCCs) | ✅ |
| See `/auth/me` profile + RBAC modules | ✅ (24h cache) |
| New GET endpoints the app hasn't visited online yet | ❌ — nothing to fall back to |
| Mutations (POST/PUT/DELETE) | ❌ — surfaces typed error + toast |
| Update to a new SW build | ✅ user-prompted Reload (Tier 1) |
| Auto-refresh when network restored | ✅ lists, lookups and identity invalidated on reconnect (U-471 excludes `['item', …]` — see below) |
| Storage usage visibility | ✅ Profile → Appearance |
| Manual "Clear cached data" | ✅ Profile → Appearance |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ React (App.tsx, components, pages)                              │
│   • <PersistQueryClientProvider> wraps the tree                 │
│   • <InvalidateOnReconnect /> invalidates on online, minus items │
│   • <OfflineBanner /> shows "Synced X ago" + WiFi-off icon      │
└──────────────────┬──────────────────────────────────────────────┘
                   │ useQuery / useMutation
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ React Query in-memory cache (gcTime: 24h)                       │
│   networkMode: 'offlineFirst' → return cached if fetch fails    │
└─────┬──────────────────────────────────────────┬────────────────┘
      │ rehydrate / dehydrate                    │ fetch
      ▼                                          ▼
┌──────────────────────┐         ┌──────────────────────────────┐
│ IndexedDB (idb-keyval)│         │ Service Worker (src/sw.ts)   │
│ Key: bo.rq.v1.<uid>   │         │ NetworkFirst strategy       │
│ Per-query maxAge:     │         │ Cache: bo-api-reads-v1      │
│   ['me']: 24h         │         │ Whitelist: GET /api/v1/get/* │
│   ['lookups',*]: 24h  │         │            /api/v1/list/*   │
│   default: 7d         │         │            /api/v1/lookups* │
│ Buster: "bo-rq-v1"    │         │            *_/by-*          │
└──────────────────────┘         │ Cap: 200 entries, 7d, 50MB   │
                                  └──────────────────────────────┘
```

## The multi-user safety contract (BLOCKING for prod)

The persisted cache is **keyed per user** via the `uid` claim in the
access JWT. This is the single most important contract in Tier 2 —
without it we ship the iOS v0.1.0 multi-user state-bleed bug.

The contract has three parts:

1. **Boot-time keying.** `src/main.tsx` reads `access_token` from
   localStorage, decodes the JWT, and derives the persister key as
   `bo.rq.v1.<uid>`. Unauthenticated boots get `bo.rq.v1.guest`.
2. **Awaited cleanup on logout.** `AuthContext.logout` is `async`. It
   awaits `clearAllUserScopedStorage()` BEFORE redirecting. That helper
   deletes the current user's persister key + the guest key from
   IndexedDB and the `bo-api-reads-v1` SW runtime cache, then calls
   `queryClient.clear()`.
3. **Forced reload on login.** Both `login()` and `signup()` do
   `window.location.href = "/"` after writing the new token. The hard
   reload re-boots the app with the new identity so the persister
   re-keys to the new user.

The contract has an automated regression test at
`src/auth/cacheCleanup.test.ts` — five Vitest specs that exercise the
cleanup primitive with `fake-indexeddb` and a `CacheStorage` stub. Run
with `npm test`. If those tests fail, **do not ship**.

## Per-query maxAge policy

`src/main.tsx`'s `shouldDehydrateQuery` filter implements the policy:

| Query key prefix | maxAge | Why |
|---|---|---|
| `['me']` | 24h | RBAC can change underneath us; stale identity is risky |
| `['lookups', ...]` | 24h | Vendors/projects/SCCs update during the day |
| `['item', ...]` | **never persisted** | U-461 — see below |
| Anything else (`['list', ...]`) | 7d | Entity lists — long enough for a weekend offline |

Queries that errored or have no data are never dehydrated.

### U-461 — single-entity payloads are never persisted (2026-09-15)

**Offline detail reads are gone.** `['item', …]` used to fall into the 7-day
bucket, which is what made this incident survive a reload:

> A reviewer approved a Bill in the web UI. Advancing a review writes the parent
> Bill row, bumping its ROWVERSION, so the open edit page's optimistic-concurrency
> token went stale and every save returned 409. Ordinary so far — you reload.
> **The reload did not help.** The bill was rehydrated from IndexedDB, and
> `BillEdit` seeds its form from the first `item` it sees and never re-seeds, so
> the fresh payload arriving moments later was discarded. Only a successful save
> would replace the cached entry, and no save could succeed.

An entity item carries a `row_version` — a *write token*. A token read off a disk
cache of unknown age can serve a read but never a write, and an age limit only
shortens that window rather than closing it: a one-hour-old token is exactly as
stale as a seven-day-old one the moment somebody else writes the row.

The trade was made deliberately: an edit page that silently stops saving is worse
than a detail screen that needs a connection. Lists, lookups and identity still
persist, so offline browsing survives down to the list level.

**U-471 finished the story, and corrected a wrong assumption in it.** U-461 stopped
a stale token being *restored from disk*; it did not stop one being *fetched fresh*
and then applied to a form whose editable fields had not moved with it. U-464/U-465
copied `row_version` out of any freshly-arrived item, which turned the fail-safe 409
into a **silent lost update**: editor A's stale body went to the server under editor
B's valid token, and B's change was gone.

Two things follow for anyone touching this area:

1. **You cannot close this by controlling refetches.** `refetchOnReconnect` is not
   set anywhere in `src/` and React Query defaults it to `true`, so any item query
   past `staleTime` refetches on reconnect no matter what `InvalidateOnReconnect`
   filters. `networkMode: "offlineFirst"` also *pauses* a failed offline GET and
   resumes it on reconnect — a path not even `refetchOnReconnect: false` would stop.
   **Gate the rebase, not the refetch.**
2. **The gate is a three-way-merge base test** (`src/hooks/serverDiverged.ts`): a
   token is rebased only when the arriving record differs from the last-in-sync
   baseline *solely* in server-owned fields. Otherwise the token stays stale (the
   save still 409s — fail-safe) and `RecordChangedBanner` offers a confirmed reload.
   The `['item', …]` exclusion in `InvalidateOnReconnect` is a reduction in pointless
   token churn, **not** the fix — do not cite it as one.

`PERSISTER_BUSTER` was bumped to `bo-rq-v2` in the same change — the filter runs
on WRITE, so without it every entry already on disk would still be restored on
the next boot and the fix would have survived its own deployment.

Policy lives in `src/persistPolicy.ts` (extracted so it can be specced; it was an
inline closure, which is why the rule behind a production incident had no test).

## Files

```
build.one.web/
├── docs/
│   ├── pwa-tier1.md            ← Tier 1 runbook
│   └── pwa-tier2.md            ← (this file)
├── src/
│   ├── main.tsx                ← PersistQueryClientProvider + per-query maxAge
│   ├── sw.ts                   ← NetworkFirst runtime caching
│   ├── api/
│   │   ├── client.ts           ← OfflineError + pre-flight (Tier 1)
│   │   └── jwt.ts              ← JWT payload decoder, uid extractor
│   ├── auth/
│   │   ├── AuthContext.tsx     ← async logout + login reload
│   │   ├── cacheCleanup.ts     ← clearAllUserScopedStorage()
│   │   └── cacheCleanup.test.ts ← contract test (5 specs)
│   ├── components/
│   │   ├── InvalidateOnReconnect.tsx ← invalidate-on-online (skips items)
│   │   └── OfflineBanner.tsx   ← "Synced X ago" pill
│   └── hooks/
│       ├── useOnline.ts        ← navigator.onLine + events
│       └── useLatestSync.ts    ← max dataUpdatedAt across cache
├── vite.config.ts              ← injectManifest mode
├── vitest.config.ts            ← Vitest + jsdom
└── vitest.setup.ts             ← fake-indexeddb + localStorage shim
```

## Deploy verification checklist

In addition to the Tier 1 checks (see `pwa-tier1.md`):

1. **`npm test` passes** — all 5 contract specs green. NON-NEGOTIABLE.
2. **Multi-user smoke test** (manual, on a real device):
   - Sign in as User A
   - Navigate around — TimeEntry list, Labor list — to populate cache
   - Sign out
   - Sign in as User B (different role, different projects)
   - On every screen, confirm User B sees ONLY their own data
   - Confirm no user-A names, projects, or amounts leak into User B's UI
3. **Cold-launch offline shows last-synced data** — install PWA, visit
   `/labor/list` while online, force-close, enable Airplane Mode, relaunch
   → list should render with WiFi-off pill saying "You're offline ·
   Synced Xm ago".
4. **Reconnect refreshes** — while offline on a **list**, turn network back
   on; the list should silently refetch and update. (Detail/edit pages are
   deliberately excluded from the reconnect sweep since U-471; they still
   refetch via React Query's own `refetchOnReconnect` once past `staleTime`.)
5. **Storage estimate works** — Profile → Appearance → Storage section
   shows Used / Available / Usage % with non-zero numbers after
   browsing.
6. **"Clear cached data" works** — tap the destructive row in Profile →
   Appearance; storage should drop, success toast fires, you stay signed
   in.
7. **API bypass for binaries** — view an attachment PDF; DevTools
   Network should show the request goes to network (not SW), since the
   route is explicitly NetworkOnly to protect IndexedDB quota.

## Known limitations

Same as Tier 1, plus:

- **`navigator.onLine` is OS routing, not API reachability.** A captive
  portal or API outage still reports `online: true`. The NetworkFirst
  3-second timeout mitigates user-visible impact, but the banner won't
  flash up just because the API is slow.
- **First-visit miss.** A screen the user has never visited online has
  nothing to fall back to. OfflineBanner says "No data cached yet" in
  that case.
- **Schema migrations.** If a TypeScript entity model gains a required
  field, old cached payloads will deserialize with `undefined` for that
  field. Bump `PERSISTER_BUSTER` in `src/main.tsx` whenever an entity
  model gains a required field; this invalidates every persisted
  payload across all users.
- **iOS Safari standalone IndexedDB eviction.** iPad PWAs can lose
  IndexedDB after ~7 days of non-use. Documented; Tier 3 will need to
  address this for write durability.
- **Two-tab race.** Two open tabs for the same user share the same
  IndexedDB; React Query will refetch on whichever mounts first. No
  explicit coordination yet. Tier 3 will introduce a `BroadcastChannel`
  leader for the outbox; Tier 2 doesn't need it.

## Tier 3 prerequisites (deferred)

If/when Tier 3 is greenlit (per the decision gate documented in
TODO.md), several Tier 2 pieces become foundations:

- The per-user persister key + cleanup contract carries forward
  verbatim
- The SW's NetworkFirst routes need to be extended with offline-aware
  POST handling (queue + replay)
- The OfflineBanner gets a queue-depth indicator
- Server-side `dbo.IdempotencyKey` table + middleware (~3 weeks of
  API work) is the hard prerequisite

See `docs/pwa-tier1.md` and the PWA evaluation memo (conversation
history, 2026-06-15) for the full Tier 3 design.
