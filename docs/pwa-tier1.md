# PWA Tier 1 — Shell-only

Build One ships as an installable Progressive Web App. Tier 1 (current)
delivers the **app shell** offline — home-screen install, branded launch
when there's no network, and an in-app update toast on new deploys. Tier
1 does **NOT** cache `/api/v1/*` responses and does **NOT** queue offline
writes; those are Tier 2 and Tier 3 respectively (see Phase 3 decision
gate in the evaluation memo).

---

## What works after Tier 1

| Capability | Works offline? |
|---|---|
| Launch the app from the home-screen icon | ✅ (after first online visit) |
| Render the React shell (login page, navigation, layout) | ✅ |
| GET requests (lists, details, lookups) | ❌ — no API caching yet |
| Mutations (POST / PUT / DELETE) | ❌ — surfaces "Not saved — you are offline." toast |
| Update to a new version | ✅ user-prompted via "Reload" banner |

## Install instructions

### iPad / iPhone (Safari)
1. Visit `https://app.bld-one.com`
2. Tap the Share button
3. Tap **Add to Home Screen**
4. Confirm name (defaults to "Build One"), tap Add
5. Launch from the home-screen icon (no Safari chrome)

### Android (Chrome)
1. Visit `https://app.bld-one.com`
2. Chrome shows an install prompt automatically; tap **Install**
3. Or tap the three-dot menu → **Install app**

### Desktop (Chrome / Edge)
1. Visit `https://app.bld-one.com`
2. Click the install icon in the address bar (a small `⊕` to the right
   of the URL)
3. Or three-dot menu → **Install Build One**

## Update behavior

`vite-plugin-pwa` is configured with `registerType: 'prompt'` — new
service-worker builds activate only when the user clicks Reload. This
prevents a bad deploy from silently breaking every installed client.

The lifecycle:
1. User opens the app, the existing SW serves the cached shell
2. SW checks for a new `sw.js` in the background
3. If a new version is found, it downloads but does NOT take over
4. `PWAUpdatePrompt` shows a bottom-center banner: "A new version is
   available." with Reload + Dismiss buttons
5. Clicking Reload calls `updateSW(true)`, which messages the SW to
   `skipWaiting` then reloads the page

## Escape hatch — `/sw-kill.html`

If an installed client is stuck on a broken SW build, the recovery URL
is:

```
https://app.bld-one.com/sw-kill.html
```

The page unregisters every service worker for the origin, clears every
cache, and redirects to `/`. Users who can't reach a working version of
the app can be sent this URL out-of-band (email, text).

The page itself is served with `Cache-Control: no-cache, no-store,
must-revalidate` and is added to the SW's `navigateFallbackDenylist`, so
it's always served fresh from origin — never intercepted by the SW.

## Known limitations

- **JWT eviction on iOS standalone PWAs.** iOS may evict localStorage
  from PWAs that haven't been opened in ~7 days. Users see a fresh login
  prompt. This is a documented iOS limitation; the auth-durability fix
  (moving to httpOnly cookie) is tracked in TODO.md as a separate
  project, intentionally NOT bundled with PWA work.
- **No offline API.** Tier 1 does not cache `/api/v1/*` responses. If
  the user navigates while offline, list/view screens will show a
  generic error toast. Tier 2 adds persistent React Query cache via
  IndexedDB.
- **No write queue.** Mutations attempted offline fail immediately with
  a "Not saved — you are offline." toast. Nothing is queued. Tier 3 (a
  separate ~10-week project, conditional on a decision gate) would add
  offline-first writes with `Idempotency-Key` server-side replay
  protection. iOS already owns this surface for field users.
- **`navigator.onLine` is OS routing, not API reachability.** Captive
  portals and API outages don't trigger the offline banner. Tier 2 will
  add an API heartbeat for true reachability detection.

## File map

```
build.one.web/
├── docs/pwa-tier1.md                 ← this file
├── public/
│   ├── icons/
│   │   ├── source/icon.svg           ← master SVG (B1 wordmark)
│   │   ├── icon-192.png              ← Android home (any purpose)
│   │   ├── icon-512.png              ← PWA splash + larger Android (any)
│   │   ├── icon-512-maskable.png     ← Android adaptive icon (maskable)
│   │   └── apple-touch-icon-180.png  ← iOS home tile
│   └── sw-kill.html                  ← escape hatch
├── scripts/gen-icons.mjs             ← one-shot regen of PNG set from SVG
├── src/
│   ├── api/
│   │   ├── client.ts                 ← OfflineError + pre-flight check
│   │   └── toastBridge.ts            ← non-React → toast plumbing
│   ├── components/
│   │   ├── OfflineBanner.tsx         ← top hover pill when offline
│   │   ├── PWAUpdatePrompt.tsx       ← bottom banner on new SW
│   │   └── ToastBridge.tsx           ← wires useToast() to module bridge
│   ├── hooks/useOnline.ts            ← reactive navigator.onLine
│   └── vite-env.d.ts                 ← virtual:pwa-register types
├── vite.config.ts                    ← VitePWA() plugin config + manifest
├── index.html                        ← apple-mobile-web-app meta tags
└── staticwebapp.config.json          ← /sw.js + /sw-kill.html cache headers
```

## Regenerating the icon PNG set

If the source SVG changes (`public/icons/source/icon.svg`), regenerate
the PNGs:

```bash
cd build.one.web
npm install sharp --no-save
node scripts/gen-icons.mjs
```

The PNGs are committed to git so production builds do **not** need
`sharp` (a heavy native dep). Only the source SVG and the generator
script live in the repo; `sharp` is install-on-demand for the rare
regen.

## Deploy verification checklist

After deploying a new SW build, run through these to catch regressions:

1. **Lighthouse PWA audit ≥ 90.** Chrome DevTools → Lighthouse →
   Progressive Web App category.
2. **Two-deploy hash-bust.** Deploy v1, install on a device, deploy v2,
   open the installed PWA → update banner should appear within ~30s of
   opening.
3. **Cold-launch offline.** Install + visit once online, enable Airplane
   Mode, force-close, relaunch from home-screen icon → React shell
   should render (not the browser's "no internet" page).
4. **iPad A2HS flow.** Safari → Share → Add to Home Screen → verify
   icon, label "Build One", standalone-mode launch without Safari
   chrome.
5. **API bypass.** Open installed PWA, DevTools Network tab → confirm
   any `/api/v1/*` call shows "Network" not "(ServiceWorker)" as
   initiator.
6. **Mutation offline.** Network → Offline → attempt to save a
   TimeEntry → "Not saved — you are offline." toast appears, no silent
   failure, no 401 redirect.
7. **Kill switch.** Visit `app.bld-one.com/sw-kill.html` from an
   installed client, refresh, confirm the page reports unregistration +
   cache clear + redirects to `/`.

## Future tiers

See the PWA evaluation memo (workflow run in conversation history) for
the full Tier 2 / Tier 3 design + decision gates. Summary:

- **Tier 2 (4 weeks)** — Persistent React Query cache via
  `@tanstack/react-query-persist-client` + `idb-keyval`. App
  cold-launches offline with last-synced data. Requires user-scoped
  persister key + awaited cleanup on logout (the iOS v0.1.0 multi-user
  state-bleed lesson).
- **Tier 3 (10 weeks)** — Local-first writes via Dexie + a custom
  outbox + server-side `Idempotency-Key` middleware. Conditional on
  Phase 3 decision gate (see evaluation memo).
