# PWA / service worker

Tier 1 + Tier 2 are shipped. The multi-user cache contract here is non-negotiable — breaking it ships the iOS v0.1.0 state-bleed bug to web.

> Extracted verbatim from `CLAUDE.md` on 2026-11-11 (U-788) to take it off the
> per-session load. **Standing rules, not history** — they bind the same as before.
> CLAUDE.md keeps the one-line rule and links here.

---

## PWA / Service Worker

Build One is an installable PWA. **Tier 1** (shell-only) shipped
2026-06-15: home-screen install, branded launch offline, in-app update
toast on new deploys. **Tier 2** (offline reads) shipped 2026-06-15:
persistent React Query cache backed by IndexedDB, NetworkFirst SW
caching for `/api/v1/get/*` + `/api/v1/list/*` + `/api/v1/lookups*` +
`/api/v1/*/by-*`, "Synced X ago" UI, storage estimate readout in Profile.
**Tier 3** (local-first writes) is conditional on a decision gate per
the evaluation memo and NOT shipped. See `docs/pwa-tier1.md` and
`docs/pwa-tier2.md` for the runbooks, install instructions, escape
hatch, and verification checklists.

Key conventions to preserve when editing PWA-adjacent code:

- **`registerType: 'prompt'`** in `vite.config.ts` — a new SW activates
  ONLY when the user clicks Reload in `PWAUpdatePrompt`. Never silent.
  This protects installed clients from a borked deploy.
- **`/sw-kill.html`** — branded escape hatch that unregisters every SW
  for the origin + clears caches + redirects. Send this URL to a stuck
  user out-of-band if recovery is needed.
- **`navigateFallbackDenylist`** in the workbox config explicitly
  excludes `/api/`, `/.auth/`, and `/sw-kill.html`. The SW must NEVER
  intercept these. Re-check the denylist whenever the SW config is
  touched.
- **`OfflineError`** (`src/api/client.ts`) is the typed error for
  network failures. `client.ts` pre-flight-checks `navigator.onLine`
  before mutations and fast-fails with `OfflineError` + a
  "Not saved — you are offline." toast (via the `toastBridge`
  module so `client.ts` doesn't need a React import).
- **`useOnline`** hook + **`OfflineBanner`** — top-center hover pill
  when offline. Banner uses `position: fixed`; it does NOT push content
  down.
- **Safe-area insets** — `index.html` has `viewport-fit=cover`. CSS
  uses `env(safe-area-inset-*)` on `.app-content` (top, for the iOS
  notch) and `.app-tabbar` / `.pwa-update-banner` (bottom, for the home
  indicator). All collapse to 0 in non-installed browsers.
- **Icon regen** — `public/icons/source/icon.svg` is the master; PNGs
  are generated via `node scripts/gen-icons.mjs` (requires
  `npm install sharp --no-save`). Source SVG mirrors the iOS
  `AppIcon-1024.png` (pure black + white "B1" wordmark) so the two
  installs look like siblings on the same home screen.

Tier 2 additions:

- **The multi-user safety contract is NON-NEGOTIABLE.** Persisted
  React Query cache is keyed PER USER (`bo.rq.v1.<uid>` in IndexedDB).
  `AuthContext.logout` is `async` and AWAITS
  `clearAllUserScopedStorage()` BEFORE redirecting. Both `login()` and
  `signup()` force `window.location.href = "/"` so boot-time keying
  picks up the new identity. Any change that breaks this contract
  ships the iOS v0.1.0 multi-user state-bleed bug to web. The
  regression test lives at `src/auth/cacheCleanup.test.ts` — five
  Vitest specs. **`npm test` must pass before deploy.**
- **Custom Service Worker** — `src/sw.ts` is the SW source. We use
  vite-plugin-pwa's `injectManifest` mode (not `generateSW`) so the
  per-pattern caching strategies are explicit. The SW NetworkFirst-caches
  whitelisted GETs; everything else (mutations, auth, attachments,
  completion polling, admin) bypasses the SW.
- **Per-query maxAge policy** — `src/main.tsx`'s `shouldDehydrateQuery`
  filter applies 24h for `['me']` + `['lookups', *]`; 7d default. RBAC
  / dropdown data churns more aggressively than entity payloads.
- **`PERSISTER_BUSTER`** — bump the string in `src/main.tsx` whenever
  an entity TypeScript model gains a required field. Invalidates every
  persisted payload across all users.
- **Test infrastructure** — Vitest + jsdom + fake-indexeddb. Setup at
  `vitest.setup.ts` polyfills `localStorage` because jsdom 29 +
  vitest 4 don't ship a complete `Storage` shape.

