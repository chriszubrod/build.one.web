At the start of each session, read the API repo's SESSION_NOTES.md at `../build.one.api/SESSION_NOTES.md` for historical context.

## Working Style

- **Plan before coding.** Propose a step-by-step plan and wait for approval before writing any code. Do not start implementing until the plan is confirmed.

## Architecture

- **Stack**: React + Vite + TypeScript. No Next.js — FastAPI (`build.one.api`) is the backend.
- **API**: All data fetched from FastAPI via `/api/v1/` endpoints. Vite dev server proxies `/api` to `localhost:8000`.
- **Response envelope**: API returns `{"data": T}` for single items, `{"data": T[], "count": N}` for lists. Use `getOne()`, `getList()`, `post()`, `put()`, `del()` from `src/api/client.ts` — they unwrap automatically.
- **Auth**: Token stored in `localStorage`. `AuthContext` provides `login()`, `logout()`, `isAuthenticated`, `username`. `ProtectedRoute` redirects to `/login` if no token. API client auto-redirects on 401.
- **Lookups**: `GET /api/v1/lookups?include=vendors,projects,...` returns slim dropdown data. Use `useLookups("vendors,projects")` hook.

## Project Structure

```
src/
├── App.tsx                 — Providers/shell only (ErrorBoundary, Router, Auth, Toast, PWA)
├── routes.tsx              — The route tree as data (`appRouteTree`); imports no shell
│                             components, so tests assert on it with zero mocks (routes.test.tsx)
├── api/client.ts           — Typed fetch wrapper (envelope unwrap, auth, errors)
├── auth/                   — AuthContext, LoginPage, ProtectedRoute
├── layout/                 — AppLayout, Sidebar, Header
├── pages/{entity}/         — One folder per entity (list, view, edit, create)
├── components/             — Shared UI (tables, form fields, dropdowns)
├── hooks/                  — Shared hooks (useLookups, useApi)
└── types/api.ts            — TypeScript types matching API response shapes
```

## Conventions

- **Page pattern**: Each entity gets a folder under `src/pages/` with up to 4 files: `List.tsx`, `View.tsx`, `Edit.tsx`, `Create.tsx`
- **Route pattern**: Match the existing URL structure from Jinja2 — `/{entity}/list`, `/{entity}/{id}`, `/{entity}/{id}/edit`, `/{entity}/create`
- **User entity is a single Profile page (2026-04-29).** `/user/:id` and `/user/:id/edit` both render `pages/users/UserProfile.tsx` (the old `UserView` + `UserEdit` split was retired). Sections: Profile basics, Credentials (admin only — POSTs to `/api/v1/admin/auth/set-credentials/:id`), Contacts (`<InlineContacts>`), Organizations, Companies, Roles, Modules, Projects. Admin gating reads `is_admin` from `useCurrentUser()` — non-admins see read-only sections with no add/remove/save controls. Companies dropdown is filtered to companies linked to the user's Organizations via the `OrganizationCompany` join. If no orgs are linked to companies yet, the empty-state hint renders inline `<Link>`s to each Organization's edit page.
- **No state management library**: Use React state + context. Add Zustand or similar only if complexity demands it.
- **CSS**: Single `index.css` with CSS custom properties. No CSS-in-JS, no Tailwind (yet). Use semantic class names.
- **Types**: Define in `src/types/api.ts`. Keep in sync with API Pydantic schemas manually for now. `CurrentUser` now includes `accessible_project_ids: number[]` (informational; no enforcement wired yet).

## Migration Plan (Phase 4)

Entity pages are being migrated from Jinja2 (in `build.one.api/templates/`) to React. Priority order:

### Tier 1 — Simple CRUD (start here)
These have standard list/view/edit/create with no special behavior:
- vendor, vendor_type, customer, company, organization
- project, cost_code, sub_cost_code, payment_term
- role, module, address, address_type
- user (includes inline role assignment)

### Tier 2 — Moderate complexity
These have additional features (dropdowns, related data, inline children):
- vendor_address, project_address
- user_role, user_module, user_project, role_module
- taxpayer, taxpayer_attachment
- review_status, classification_override
- integration, sync

### Tier 3 — Complex entities
These have auto-save, completion workflows, line items, attachments, inline email:
- bill (auto-save, line items, attachments, completion, review workflow)
- expense (auto-save, line items, attachments, completion)
- bill_credit (line items, attachments, completion)
- invoice (line items, enrichment, PDF packet, reconciliation, completion)
- contract_labor (import, status workflow, PDF generation, billing)

### Tier 4 — Special pages
- dashboard (needs summary API — currently stubbed)
- admin (workflow monitoring, actions)
- inbox (email processing — needs API routes first)
- auth (login/signup — already done)

### Per-entity migration checklist
For each entity migration:
1. Add TypeScript types to `src/types/api.ts`
2. Create page component(s) in `src/pages/{entity}/`
3. Add route(s) to `src/routes.tsx` (the route tree; `App.tsx` is providers/shell only — U-066)
4. Add sidebar link (automatic via modules lookup)
5. Verify end-to-end with live API
6. Check if any new API endpoints are needed (dropdowns, relationships)

## Dev Server

```bash
npm run dev          # http://localhost:3000
npm run build        # Production build to dist/
npx tsc --noEmit     # Type check without building
```

**Dev talks directly to prod API.** `.env` sets `VITE_API_BASE_URL` to the
Azure App Service URL (currently `https://buildone-esgaducjg4d3eucf.eastus-01.azurewebsites.net`);
all `client.ts` helpers and SSE readers prefix it automatically. No local
API process, no `/api` proxy in `vite.config.ts`.

**Consequence:** every local click that writes (create/edit/delete, bill
completion → SharePoint + QBO push, etc.) mutates production data.
Treat dev as a read-with-caution environment, same as the API repo's
environment-isolation note.

**Use `client.ts` helpers, not raw `fetch("/api/...")`.** Raw relative
paths would hit `localhost:3000/api/...` with no proxy — 502. If an
endpoint doesn't fit the envelope pattern (`{data: ...}`), use
`rawRequest` directly; the other helpers unwrap automatically.

## Navigation architecture

Single source of truth: `src/layout/menuConfig.ts`. Both `BottomTabBar`
(mobile/tablet) and `AppSidebar` (desktop) render `primarySlotsForUser(me)`
for the primary tier, then `secondarySectionsForUser(me)` for everything
else (U-046, 2026-07-16).

`secondarySectionsForUser` is the single source of truth for "what is NOT
on the primary nav for this user": it composes `entriesInSection` (RBAC
gating) over `SECONDARY_SECTION_SPECS`, drops any entry already occupying
a primary slot (so Profile/Projects never double-list), and omits empty
sections. **Both** surfaces must consume it — do not hand-maintain a
per-surface section list. That is exactly the bug U-046 fixed: BottomTabBar
and AppSidebar each kept their own list and both omitted `contacts`, so
Vendors/Customers were URL-only on every breakpoint. A test tripwire in
`menuConfig.test.ts` now fails if a `MENU_ENTRIES` section is missing from
the spec list.

`MoreDrawer` (bottom sheet) renders those sections on mobile; `BottomTabBar`
shows its "More" slot only when the helper returns ≥1 section, so the
trigger can never open an empty drawer. **`MoreDrawer` must stay mounted
OUTSIDE `<nav className="app-tabbar">`** — that pill has
`transform: translateX(-50%)`, and a transformed ancestor becomes the
containing block for `position: fixed` descendants, which would clip the
sheet to the pill instead of the viewport. `BottomTabBar.test.tsx` pins
this as a DOM-tree assertion.

Module name constants live in `src/shared/modules.ts`
— mirror of `build.one.api/shared/rbac_constants.py`. Never use the raw
module-name string literals (`"Contract Labor"`, etc.) in nav code;
typos on a literal silently hide entries while typos on a constant fail
compilation.

Breakpoint tiers (2026-06-17 flip):
- **Mobile portrait** (default, < 768w): `.app-shell` is a 430px column,
  BottomTabBar floating pill visible, AppSidebar hidden.
- **Tablet + Desktop** (≥ 768w): sidebar + main row, BottomTabBar hidden.
  Previously gated on `(min-width: 1024px) and (hover: hover) and
  (pointer: fine)` — left iPad PMs in the 430px phone column. iPad
  portrait may feel cramped at 768; an opt-out under
  `(orientation: portrait) and (max-width: 820px)` is documented in
  index.css for the future if needed.
- **Mobile landscape** (`(orientation: landscape) and (max-height: 500px)`):
  rotate overlay (RotateOverlay component).

Primary slots are CURATED per role in `PRIMARY_SLOTS_BY_ROLE`
(menuConfig.ts). Phase 1+ extends each role's list as financial entities
unpark. **Do NOT gate any menuConfig entry on a hardcoded role name
string at the consumer level** — gate on module read perms or
`is_admin` only. Role names are RBAC-table mutable; gating on them
creates silent breakage if Ops renames a role.

Landing route: `LandingRedirect` resolves `/` and `*` to either Time
Tracking or Profile based on `Time Tracking.can_read` (with
`is_admin` bypass). System admins land on Time. Field workers without
Time grant land on Profile.

For the full nav strategy + Phase 1+ roadmap, see TODO.md "Nav strategy"
section.

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

## Documentation surface (/docs)

Admin-only internal docs at `/docs` (routes in `src/routes.tsx`, **lazy-loaded** via
`React.lazy` so react-markdown stays out of the main bundle). Dual-gated:
`menuConfig` entry `requiresAdmin: true` — surfaced through the **Reference**
group in `AppSidebar` (NOT the primary bottom pill) — plus a page-level
`is_admin` redirect in `DocsPage.tsx`. Built on the native primitives
(`ios-page` / `SectionCard` / `ListRow` / `NavHeader`) as a drill-down
(`DocsHome` → section), matching Time/Labor/Profile.

It documents the **whole application** (Hybrid: curated narrative + introspected
facts, freshness-badged LIVE/DERIVED/CURATED). **It must stay current as
features change — Chris can't maintain it manually, so it is the Docs step of
the per-unit pipeline** (umbrella `CLAUDE.md` + umbrella memory
`feedback_docs_keep_current.md`).

- **iOS section** (v1, shipped 2026-06-20): DERIVED facts vendored from
  `build.one.ios`. After ANY iOS app-shape change: `python3
  scripts/gen_docs_manifest.py` (in the iOS repo) → `npm run docs:sync:ios`
  (here) to re-vendor `src/docs/ios/`. Narrative lives in
  `build.one.ios/docs/app-guide/*.md`.
- **Adding a section** (API live / Web / MCP / Scheduler derived): add an entry
  to `src/pages/docs/docsSections.ts` + a component under
  `src/pages/docs/sections/`. API is the planned LIVE one (`/openapi.json` +
  registries behind a `require_system_admin` endpoint in `build.one.api`).
- Gating is **presentational only** — bundled content is intentionally
  non-sensitive (see the header comment in `src/pages/docs/DocsPage.tsx`).

Follow-ups (API section, web/mcp/scheduler generators, freshness CI/hook) are
tracked in `TODO.md`. Mobile reachability is **done** — U-046 wired `MoreDrawer`
into `BottomTabBar`, so system admins reach `/docs` on a phone via
More → Reference.
