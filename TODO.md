# TODO — build.one.web

Pending work, deferred decisions, known issues. Check off as done; prune anything stale.

---

## /docs surface — keep current + extend

v1 (admin-only, iOS section) shipped 2026-06-20. **Standing rule:** every feature add/change refreshes the matching `/docs` section — the Docs step of the per-unit pipeline (see `CLAUDE.md` "Documentation surface" + umbrella memory `feedback_docs_keep_current.md`). Follow-ups:

- [ ] **API section (LIVE)** — highest value: a live OpenAPI explorer from `/openapi.json` + entity/agent registries, behind a new `require_system_admin` admin endpoint in `build.one.api`. The first section that's genuinely always-current; replaces the "coming soon" stub in `docsSections.ts`.
- [ ] **Web / MCP / Scheduler sections (DERIVED)** — build-time generators: web route table (`App.tsx` / `menuConfig.ts`), MCP tool manifest (`tools/*.py`), scheduler cron inventory (`function_app.py`). Each replaces a "coming soon" stub.
- [ ] **Mobile reachability** — `/docs` is desktop-sidebar-only today (Reference group). Wire `MoreDrawer` into `BottomTabBar` so admins reach it on phones, or consciously accept desktop-only.
- [ ] **Freshness enforcement (hardening)** — no CI exists; the iOS snapshot can silently lag if `gen_docs_manifest.py` + `docs:sync:ios` aren't re-run. Consider a `build`-time freshness check (fail if `src/docs/ios` differs from the iOS source when both repos are checked out) and/or a `settings.json` hook so refresh isn't purely manual.

---

## PWA — Tier 2 / Tier 3 decision gates

- [ ] **JWT-in-localStorage durability on installed PWAs.** Surfaced 2026-06-15 (Phase 1.9). iOS Safari may evict localStorage from standalone PWAs after ~7 days of non-use, silently logging the user out. Documented as a Tier 1 known limitation. Long-term fix is migrating refresh tokens to httpOnly cookies + access tokens to in-memory only; that's a separate auth-durability project with CORS + CSRF implications. Do NOT bundle into PWA Tier 2/3 work — flag it, then decide independently. Triggers: complaints from installed-PWA users about unexpected sign-outs, or once Tier 2 lands and the surface becomes more "app-like" in expectation.
- [x] **Tier 2 — offline reads** shipped 2026-06-15 same session as Tier 1. Persistent React Query cache via `@tanstack/react-query-persist-client` + `idb-keyval` with user-scoped persister key; multi-user safety contract enforced via `clearAllUserScopedStorage` + awaited logout + login reload (5-spec Vitest regression test at `src/auth/cacheCleanup.test.ts`). NetworkFirst SW routes for `/api/v1/get/*`, `/api/v1/list/*`, `/api/v1/lookups*`, `/api/v1/*/by-*`. OfflineBanner shows "Synced X ago". Storage readout in Profile → Appearance. See `docs/pwa-tier2.md`.
- [ ] **Tier 3 decision gate — local-first writes.** Conditional, not committed. Greenlight Tier 3 (~10 weeks server + client) only if (a) >20% of mutations are attempted while OfflineBanner is visible (instrument via telemetry after Tier 2 lands), (b) PMs ask for browser-side offline writes specifically, or (c) Android tablets / Chromebooks come on the roadmap. Otherwise mark "deferred indefinitely" — iOS already owns the offline-write surface for field users. Server-side prerequisite (`dbo.IdempotencyKey` table + middleware on every mutation route, ~3 weeks) has independent value for iOS hardening even if Tier 3 itself is deferred.
- [ ] **Theme-color + manifest colors.** ~~Was the deferred Phase 6 follow-up from the initial mobile-shell work.~~ Folded into PWA Tier 1 Phase 1.2 — `theme_color` is now `#1a1816` (charcoal) and `background_color` is `#f4f2ee` (warm cream) in both `index.html` and the manifest emitted from `vite.config.ts`. Close.

---

## TimeEntry view — auto-save / concurrency follow-ups (deferred)

Surfaced by the Codex Pass-1 review of the TimeEntryView concurrency hardening
(`f1f75c0`, 2026-07-11). The 4 P1 data-loss bugs from that review are **fixed +
shipped**; these are the lower-severity residuals left for later.

- [x] **`useAutoSave` drop-without-reschedule (P2, pre-existing, shared hook). FIXED
  2026-07-12.** `src/hooks/useAutoSave.ts` now serializes saves via a single-in-flight
  runner: a request made while a save is in flight sets a pending flag and a single
  coalesced follow-up runs the latest `saveFn` after the in-flight save resolves
  (loops until nothing pending); `flush()` resolves only after the latest state is
  persisted (awaits in-flight + follow-up); reentrancy-safe (in-flight promise
  published to `inFlightRef` synchronously before `saveFn` runs). Codex round-1 caught
  that the reschedule alone still sent a **stale `row_version`** for row_version-coupled
  callers (follow-up runs before React commits the prior save's `setForm`, and
  `UpdateExpenseById` rejects a stale token → silently-lost edit). Full fix: **Expense**
  (`autoSaveHeader` + `saveAll`) and **TimeEntry** (`autoSaveHeader`) now source
  `row_version` from a `rowVersionRef` updated synchronously on save success, with a
  `useEffect(() => { ref.current = null }, [form?.row_version])` clear so external
  hydrations stay authoritative. Codex PASS after 2 fix rounds (P1/P2/P3 closed;
  Expense Complete path + f1f75c0 guards intact). 6 vitest specs on the hook
  (reschedule / flush-await / no-overlap / mount-skip / reentrancy / ref-visibility).
  **Note:** `BillEdit.tsx` does NOT use `useAutoSave` (manual `saveAll` on Complete) —
  not a caller today; it becomes one when Bills unparks. Coverage boundary: the caller
  `rowVersionRef` edits have no component-level unit test (repo has no
  `@testing-library/react` harness) — covered by tsc (TimeEntry only; `pages/expenses`
  is excluded from `tsconfig.app.json`), build, Codex re-review, and the hook's
  ref-visibility spec.
- [ ] **Extract `useSyncedToken(form?.row_version)` when Bills gets auto-save (Pass-2
  altitude follow-up, 2026-07-12).** The `rowVersionRef` + clear-effect + `?? committed`
  read pattern is duplicated in ExpenseEdit + TimeEntryView. At 2 callers it's left
  inline (rule-of-three); extract a tiny `useSyncedToken` hook (`{ read, set }` +
  the clear-effect) as the **first step** of wiring Bills onto `useAutoSave`, so the
  silent-failure-critical clear-effect is never hand-copied into a 3rd caller.
- [ ] **Entry-delete vs in-flight log-save race (P3).** `f1f75c0` disables Delete
  Entry + guards `handleDelete` while any log row is `saving`, closing the main
  window. Residual: the guard is a point-in-time snapshot, so a delete initiated in
  the same tick a log save starts is still theoretically racy. Low severity — revisit
  only if it manifests.

(BudgetLayout / BudgetSidebar nav-retirement is already tracked under **Phase 1B**
below.)

---

## Nav strategy — Phase 1+ (from 2026-06-17 navigation evaluation)

Pattern locked: **Bottom Tab Bar + Hamburger Drawer** with a curated per-role primary-slot resolver. Phase 0 shipped this session (chassis only — no user-visible nav change except the tablet sidebar flip). For the full evaluation see the workflow output at `/private/tmp/claude-501/-Users-chris-Applications-build-one/7b4ffd2a-28ac-4754-9941-d5889b92a8cd/tasks/w0sh0c392.output`.

Project-scoped vs entity-scoped doors decision (2026-06-17): **both, sharing one component.** Each entity (Bills, Expenses, Invoices, BillCredits, Budget, ContractLabor) gets a top-level nav entry (entity-centric flat list with filters) AND a Project detail page tab (project-scoped pre-filtered view). The list component takes `defaultFilter` + `hiddenFilters` + `showProjectColumn` props; top-level call passes nothing, project tab call locks project_id.

### Phase 1A — Project as hub (shipped 2026-06-17)

- [x] **New `src/pages/project/ProjectDetailScreen.tsx`** with tabs: Overview, Budget, Bills (placeholder), Expenses (placeholder), Invoices (placeholder), Labor (placeholder). Lives at `/project/:publicId`. The "project as hub" pattern.
- [x] **`BudgetView` refactor** — extracted `BudgetViewContent({ publicId })` so the same component renders as a route at `/budget/:publicId` AND embedded in the Project → Budget tab. The wrapper still renders at the page route.
- [x] **New `src/pages/project/ProjectList.tsx`** — minimal list (name + abbreviation + status, click to detail). Phase 1B will refurbish to a richer list with filters + customer column.
- [x] **menuConfig: Projects entry** under `section: "financials"`, module `Modules.PROJECTS`, priority 30, icon Briefcase.
- [x] **PM / Owner / AP / AR / Controller / Reviewer / Auditor / Tenant Admin curated slots** updated to `["time", "labor", "projects", "profile"]`. DEFAULT_PRIMARY_SLOTS also updated for unknown-role + system-admin fallback.
- [x] **App.tsx routes**: `/project/list` and `/project/:publicId` inside AppLayout, under ProtectedRoute.
- [x] **menuConfig tests** updated (24/24 specs pass) — covers Projects in curated mappings, in entriesInSection("financials"), fallback for unknown roles.
- [x] **CSS** for `.project-tabs` / `.project-tab` strip — horizontally scrollable, charcoal active state.
- [x] **New `fetchBudgetByProject` + `budgetKeys.byProject`** in `src/api/budget.ts` so the Budget tab can resolve a project's budget without a manual lookup.

### Phase 1B — Vendors + Customers unpark + BudgetLayout retirement (next session)

- [ ] **Unpark `pages/vendors/`** — remove from tsconfig exclude. Verify VendorList / VendorView / VendorEdit / VendorCreate against current API envelope + Tier 2 cache patterns (`/api/v1/get/*` is whitelisted; `/list/*` is whitelisted). Add menuConfig entry under `section: "contacts"`, module `Modules.VENDORS`.
- [ ] **Unpark `pages/customers/`** — same pattern as Vendors. Add menuConfig entry under `section: "contacts"`, module `Modules.CUSTOMERS`.
- [ ] **Retire `BudgetLayout` / `BudgetSidebar`.** Move `/budget/list`, `/budget/create`, `/budget/:publicId`, `/budget/:publicId/edit` into `AppLayout` (currently in `BudgetLayout` sibling chrome). `/budget/:publicId` can either stay as the page route OR redirect to `/project/{budget.project_public_id}` with the Budget tab pre-selected — pick when implementing.
- [ ] **Wire the `more` slot to BottomTabBar.** When `entriesInSection(...)` returns non-empty content for any drawer section (Phase 1B introduces Vendors + Customers in contacts), every role's bottom pill ends with a "More" slot that opens `MoreDrawer`. Cap stays at 5 slots — pill becomes 4 primary + 1 more.
- [ ] **Refurbish `pages/projects/` ProjectList** to a richer list (filters, customer column, search) — replaces the minimal ProjectList from Phase 1A.

### Phase 2 — Tier 3 financial surfaces (3-4 weeks, web-only)

### Phase 2 — Tier 3 financial surfaces (3-4 weeks, web-only)

- [ ] **Unpark Bills.** Verify scaffolds against API envelope + auto-save (300ms debounce per pattern) + completion-outbox + ReviewTimeline patterns. Add to `menuConfig.ts` under `section: "financials"`, module `Modules.BILLS`. AP / Controller pill swaps to `["bills", "expenses", "invoices", "more", "profile"]`.
- [ ] **Unpark Expenses.** Same scaffolding verification. AP / field-receipt-capture get Expenses in their pill.
- [ ] **Unpark Invoices.** Same. AR / Controller pill gains Invoices.
- [ ] **Unpark BillCredits.** Lower-frequency surface; lives in More drawer Financials section, not a primary slot.
- [ ] **Project detail page Bills/Expenses/Invoices/ContractLabor tabs** become fully functional — same list component as top-level entries, with `defaultFilter={{ project_id }}` + `hiddenFilters={['project_id']}` + `showProjectColumn={false}`.
- [ ] **Per-role primary slot mapping update** in `PRIMARY_SLOTS_BY_ROLE` for AP / AR / Controller / Reviewer / Auditor / Tenant Admin.

### Phase 3 — Admin section (2-3 weeks, web-only)

- [ ] **Unpark Users / UserList / UserCreate, Roles, Modules, Organizations, Companies, Integrations, Review Statuses.** Add admin section entries with `requiresAdmin: true` where appropriate. Most lives in sidebar Admin section (collapsed by default).
- [ ] **Reference Data sub-group inside Admin.** Cost Codes / Sub Cost Codes / Payment Terms / Review Statuses / Address Types / Vendor Types / Taxpayers. Collapsed by default; phone access only via deep link.
- [ ] **UserRole / RoleModule / UserModule / UserProject** as standalone Admin entries for bulk operations (inline editors on User/Role pages handle the common case).

### Phase 4 — Dynamic menuConfig + IsNavigable (1 week, requires API change)

- [ ] **API: `dbo.Module.IsNavigable BIT NOT NULL DEFAULT 1`.** Lets ops hide modules from nav without revoking permissions. ~2 hours server.
- [ ] **Refactor `menuConfig` to consume `me.modules` directly.** Render any module with `can_read && is_navigable && route !== null`. Hardcoded `MENU_ENTRIES` collapses to ~5 (Profile, sub-screens of Profile, anything without a Module). Per-role primary slot resolver becomes a priority map keyed on module name.

### Phase 5 — Deferred (do not attempt until earlier phases prove out)

- [ ] **Cross-entity Search.** Multi-week — needs API + indexing decision. When built, lands as a header bar input (cmd-K) — NOT a menuConfig entry.
- [ ] **Dashboard.** Defer until Phase 3 telemetry shows what roles open first. Too many audience-specific KPIs to spec prematurely.
- [ ] **Inbox / Email Messages.** Gated on the larger inbox rebuild per umbrella MEMORY.md — no timeline.
- [ ] **BuildOneTray revival.** Separate UX project.

### Anti-patterns to avoid (codebase-specific)

- Don't ship a 5+ entry flat bottom tab bar. Stay at 5 slots max. Capacity grows via the More drawer.
- Don't put financials as Profile sub-screens just because they fit alphabetically under "Account."
- Don't spin up another `BudgetLayout`-style sibling chrome.
- Don't gate menuConfig entries on hardcoded role name strings. Use module read perms or `is_admin`.
- Don't add Reports / Inbox menuConfig entries as placeholders — both need API support that doesn't exist.
- Don't touch `NavHeader.tsx` per-page back/title conventions — orthogonal to top-level nav.
- Don't revive `BuildOneTray` or `src/agents/` tree as part of nav work — separate UX project.

---

## Auth / authz hardening — API repo follow-ups (from 2026-06-16 evaluation)

The full auth+authz evaluation lives in the workflow transcript at
`/private/tmp/claude-501/-Users-chris-Applications-build-one/7b4ffd2a-28ac-4754-9941-d5889b92a8cd/tasks/wuqbrmpaw.output`
(audit + risk pass across web/api/ios). Web-side Phase 0 (redirectToLogin
cleanup, Sign out of all devices, agent transcript scoping) shipped this
session. The items below are API-repo work, in priority order per the
user's answers to the open questions.

### Phase 0.5 — refresh cookie never reaches the API (SameSite=Lax + cross-site) — ✅ RESOLVED via Path B (2026-07-12)

> **UPDATE 2026-07-10 — Path A REVERTED; Path B underway; deploy HELD at Gate 2.** Path A (SameSite=None) was built then reverted: Codex Pass-1 confirmed a **P1** — even once the cookies transmit cross-site, the CSRF double-submit still 403s because the web reads `token.csrf` from `document.cookie` (`src/api/client.ts:68`) but that cookie is host-only on the API host and unreadable from `app.bld-one.com`. Path A just trades a 401 for a 403; the hourly logout persists (plus SameSite=None is third-party-cookie auth → Safari ITP / Chrome phase-out fragility). Pivoted to **Path B (custom API domain `api.bld-one.com`)** → app+api share eTLD+1 `bld-one.com` → same-site → Lax works AND the CSRF cookie is readable (scoped `Domain=bld-one.com`). **✅ DONE 2026-07-12:** API deployed (`master` — `api.bld-one.com` + managed cert + CSRF `Domain=bld-one.com` cookie), then the web flipped `VITE_API_BASE_URL` → `https://api.bld-one.com` (`main` `9654743`) + SWA-deployed to `app.bld-one.com`. Verified: the live bundle references only `api.bld-one.com`; CORS preflight from `app.bld-one.com` → `api.bld-one.com/auth/refresh` returns 200 with Allow-Credentials + Allow-Origin `https://app.bld-one.com` + Allow-Headers `x-csrf-token`. Same-site → SameSite=Lax + CSRF double-submit both work. **Human check pending:** confirm a live browser session stays logged in past ~60 min. Full runbook + API detail: `build.one.api/TODO.md` "Auth cross-site 'hourly re-login' fix → Path B". The original Path A/B write-up below is retained for context — Path A is now moot.

- [ ] **Fix the refresh-cookie cross-site drop.** Surfaced 2026-06-16. User reports being forced to log in roughly every hour. Root cause confirmed by reading `entities/auth/api/router.py:95-120` + `.env:18`: the three auth cookies (`access_token`, `refresh_token`, `token.csrf`) are all set with `samesite="lax"`. The web is hosted at `app.bld-one.com`; the API is at `buildone-esgaducjg4d3eucf.eastus-01.azurewebsites.net`. These are different sites (different eTLD+1). `SameSite=Lax` allows cookies on top-level navigation but **NOT on `fetch()` cross-site requests**. So every time the access token expires (60 min per `access_token_expire_seconds=3600`), the web POSTs to `/api/v1/auth/refresh` → browser refuses to send the refresh cookie → server returns 401 → user bounces to /login. The 30-day refresh token TTL is irrelevant because the cookie never reaches the server.

  **Two paths:**
  - **Path A — change SameSite to None (immediate).** Edit `entities/auth/api/router.py:95-120` to `samesite="none"` (keep `secure=True` — required when SameSite=None). Verify the CORS config has `allow_credentials=True` AND `allow_origins=["https://app.bld-one.com"]` (or a list including it — wildcard `*` is incompatible with credentials). Test: log in, wait 60+ min or manually expire the access token, confirm a background API call refreshes instead of bouncing to /login. ~1 hour incl. verification.
  - **Path B — Custom API domain (proper long-term fix).** Move the API to `api.bld-one.com`. Then both surfaces share eTLD+1 = `bld-one.com` → same-site → `SameSite=Lax` works as-is. Already on this TODO as the deferred "Custom API domain (api.bld-one.com)" item. Resolves this issue as a side effect AND avoids the wider `SameSite=None` cookie surface.

  **Recommendation**: Path A now for immediate relief, then Path B when the custom-domain work happens (which moots Path A's wider cookie permission).

  **Verification once Path A lands**: open DevTools → Application → Cookies on `buildone-…azurewebsites.net` after a fresh login. The three auth cookies should show `SameSite=None`. Then on the Network tab, trigger a 401 + refresh; the refresh request's Cookie header should include the refresh cookie. Today that header is empty.

### Phase 1 — Active Sessions surface + agent audit-trail (yes/strong appetite)

- [ ] **Active Sessions API endpoints.** Build out:
  - `GET /api/v1/mobile/auth/sessions` — list active `AuthRefreshToken` rows for the caller. Fields: `(jti, issued_datetime, last_used_datetime, user_agent, ip, is_current)`. The "current" flag marks the row whose hash matches the caller's refresh-cookie.
  - `DELETE /api/v1/mobile/auth/sessions/{jti}` — revoke a specific session (reuses `revoke_by_jti`).
  - Capture `User-Agent` + remote IP at refresh-token-mint time and persist on the row (column add to `dbo.AuthRefreshToken`, sproc update, service threading from the request via FastAPI `Request` object).
  - Effort: ~3 days. Web-side `Profile → Active sessions` screen + per-row revoke is then a ~2-day follow-up.
- [ ] **Agent audit-trail separation — shape A (`acting_on_behalf_of_user_id` column).** Decision locked 2026-06-16: column shape, NOT JWT actor claim, NOT header pattern. Rationale: smallest schema delta, captures the audit need without touching the JWT/RBAC layer; if RBAC-level on-behalf-of becomes needed later, shape C can be layered on top without rework. Work:
  - Add nullable FK `ActingOnBehalfOfUserId BIGINT NULL FK User.Id` to: `Workflow`, `AgentSession`, optionally `Bill` / `Expense` / `Invoice` create rows.
  - New ContextVar `current_acting_on_behalf_of_user_id` populated when an orchestrator's delegation tool fires. ToolContext threads it through every sub-agent call.
  - Service-layer writes to `Workflow.ActingOnBehalfOfUserId` when the ContextVar is set.
  - Surface in an admin audit view (separate web task once data flows).
  - Effort: ~1 week. Server-only; no web-side dependency.

### Phase 2 — Server-side hardening (1-2 weeks, defer 4-6 weeks)

- [ ] **Cross-worker RBAC cache invalidation.** `shared/rbac.py` keys cache per (user_sub, company_id) with 5-min TTL. `invalidate_all_caches()` only clears the dict in the worker that handled the mutation — other gunicorn workers serve stale grants for up to 5 min. Implement via a small Redis pubsub (preferred — App Service can add Azure Cache for Redis Basic at ~$15/mo) OR a polling watermark in `dbo.RbacInvalidation` table that each worker checks every 30s. Manifests today as "I changed your role and you still see the old menu." Effort: ~3 days for the Redis path, ~5 days for the DB-polling path.
- [ ] **401 vs 403 discrimination.** Web's `redirectToLogin` fires on every 401 — including 401s emitted by a backend bug, misconfigured `require_module_api`, or 502→401 proxy translation. Server should return 403 for permission denials, reserve 401 for "authentication invalid" (missing/expired/forged token). Web client checks the body for `error="invalid_token"` per RFC 6750 §3.1. Trivial server change (FastAPI dependencies + custom 401 exception handler); ~1 day web change to discriminate. Effort: ~2 days total.
- [ ] **JWT `kid` claim + JWKS endpoint.** Manual secret rotation today means a rotation-day code redeploy. Adding `kid` to the JWT header + serving a JWKS endpoint (`GET /.well-known/jwks.json`) lets the secret rotate independently of code deploys. Can stay on HS256 (uglier but lower-risk) or switch to RS256 simultaneously. Defer until next rotation actually happens. Effort: ~3 days HS256+kid, ~5 days for RS256 migration.

### Phase 3 — DEFERRED, conditional

- [ ] **React Query persister cid-keying.** Today the persister key is `bo.rq.v1.<uid>` — switching Companies (cid changes) keeps the same key, leaking Company A's cached entity data into Company B context. Latent today (single Company in prod); user confirmed Phase 5b multi-Company is >6 months out. Add `// FIXME(Phase-5b)` comment in `src/main.tsx` so it's visible when the time comes. Effort: ~2 hours.
- [ ] **httpOnly cookie for access token.** Defeats XSS exfiltration of the JWT. Big project — CORS rework, CSRF rework, potentially breaks the agent-as-user pattern. Standalone effort. Trigger: real XSS incident, security audit, or regulatory ask. Effort: ~6-8 weeks if greenlit.

---

## Profile — Self-read carve-out on Contacts endpoint (API change)

- [ ] **`GET /api/v1/get/contacts/user/{user_id}` is gated on `Modules.VENDORS`.** Surfaced 2026-06-15 while wiring the Profile Contact rows. The endpoint reads ANY user's contacts as long as the caller holds the Vendors module (legacy "manage a vendor's contact list" use case). Side effect: a non-admin user who lacks Vendors read can't see their OWN Contact data on `/profile` or `/profile/details` — the row falls to "—". Christopher (system admin) sees it fine because IsSystemAdmin bypasses module gating; field users with role e.g. Field Crew / Intern would not. **Fix lives in `build.one.api`**, two options:
  1. **New endpoint `GET /api/v1/get/contacts/user/me`** — auth-only (no module gate), reads `current_user_id` from the ContextVar, returns just the caller's contacts. Same shape as `read_by_user_id`. Web's ProfileView + UserDetailScreen switch to this endpoint when reading the caller's own contacts (no behavior change for admin Vendors-side use of the existing endpoint).
  2. **Self-read carve-out on the existing endpoint** — at the top of `get_contacts_by_user_id_router`, if `user_id == current_user_id.get()`, skip the Vendors check; otherwise require it. Minimal surface change but couples auth-vs-RBAC in a way that's easy to miss when someone adds a new gate.
  Recommend option 1 — single-purpose endpoint, single-purpose docstring, easier to RBAC-audit. Web change is a one-line URL swap. Defer until a non-admin user actually hits this on prod (Christopher is the only active human signing into web today; field users land on iOS).

---

## Budget UI — future work

- [ ] **Change-order timeline on the budget view (future version).** Requested 2026-06-15. Render the revision history as a visible amendment ledger/timeline on `BudgetView`, not just the flat revisions table that ships today. Each entry = a revision in order (Original, then each Change Order) showing: title, status badge, effective date, **net dollar impact** (sum of that revision's line `price` deltas — contract value; optionally `amount` for cost), approver + approved date, and a **running contract total after each approved revision**. Expandable to that revision's delta line items. **No backend work needed** — the data already exists: `GET /api/v1/get/budget-revisions/by-budget/{budget_public_id}` (carries `approved_by_user_id`/`approved_datetime`/`effective_date`/`type`/`status`/`revision_number`) + `GET /api/v1/get/budget-line-items/by-revision/{revision_public_id}` for each revision's delta lines. Pure frontend addition to `src/pages/budgets/BudgetView.tsx` (+ `budget.css`). Only approved revisions count toward the running total; draft COs shown as pending. Context: umbrella memory `project_budget_entity.md`.

---

## Audit 2026-05-20 — Web findings

Full multi-repo audit memory: `~/.claude/projects/-Users-chris-Applications-build-one/memory/project_audit_2026_05_20.md`. Web-specific findings below; pair with that memory for context, cross-repo patterns, and Tier-1 fix list.

### Critical / High
- [x] **`AuthContext.isAuthenticated` and `ProtectedRoute` read `localStorage` during render — non-reactive.** [src/auth/AuthContext.tsx:44](src/auth/AuthContext.tsx); [src/auth/ProtectedRoute.tsx](src/auth/ProtectedRoute.tsx). Login/logout doesn't update derived state until the component remounts. Users can land in redirect loops or blank pages. Fix: derive `isAuthenticated` from `username` state (already reactive via `setUsername`); refactor `ProtectedRoute` to use `useAuth().isAuthenticated`. **DONE (U-014, 2026-07-14):** `isAuthenticated = username !== null`; `ProtectedRoute` consumes `useAuth().isAuthenticated`. Same-tab login/logout/session-expiry now update the gate without a remount. Follow-up filed below (cross-tab gate sync).
- [ ] **Cross-tab auth-gate sync (follow-up from U-014).** [src/auth/AuthContext.tsx:44](src/auth/AuthContext.tsx). `isAuthenticated` derives from same-tab `username` state; there's no `storage` listener, so a logout/login in another tab doesn't flip THIS tab's gate until its next server touch (a data fetch's 401 → `client.ts` `redirectToLogin` self-heals it — no data is exposed, gate is just briefly stale). Pre-U-014 code had the same gap (no listener; it only re-read localStorage incidentally on render). Correct fix is NOT a naive `storage`→`setUsername` (a cross-tab *login-as-other* would then swap identity without re-keying the per-user persister → the multi-user bleed contract). Do it as **hard-reload-on-storage-change** (`window.location.reload()` when `access_token`/`username` changes in another tab) so boot-time persister re-keying runs — its own unit + review. Low priority: data never leaks; only the render-gate lags. [src/api/client.ts:49](src/api/client.ts); [src/auth/AuthContext.tsx:37,62](src/auth/AuthContext.tsx). CSRF cookie is correctly httpOnly; the access token isn't. Long-term fix: move JWT to httpOnly cookie (requires API changes). Interim: tight CSP headers + remove every `dangerouslySetInnerHTML` usage.
- [ ] **Logout clears only `["me"]` query from React Query cache.** [src/auth/AuthContext.tsx:69-75](src/auth/AuthContext.tsx). User A's vendor/project/bill caches remain visible to User B until refresh. Fix: `queryClient.clear()` on logout.
- [ ] **Complete/Delete handlers missing `finally { setX(false) }`.** [src/pages/bills/BillEdit.tsx:221-233](src/pages/bills/BillEdit.tsx); [src/pages/expenses/ExpenseEdit.tsx:204-217](src/pages/expenses/ExpenseEdit.tsx); [src/pages/invoices/InvoiceEdit.tsx:198-210](src/pages/invoices/InvoiceEdit.tsx). Success path leaves the button stuck disabled; potential setState-on-unmounted-component warning when navigation fires. Same pattern on `BillCreate.tsx:46-80` (saving). Fix: wrap each in `try { ... } finally { setX(false); }` (and bail with a mounted ref check if needed).
- [ ] **Bill complete missing `await flushAutoSave()` before `saveAll()`.** Expense does it (`ExpenseEdit.tsx:206`), Bill + Invoice don't. Auto-save race vs. complete persists. Fix: call `flushAutoSave()` (or equivalent) first.
- [ ] **`BillEdit.tsx:69-71` formRef captured null before initialization** — fast user can tap Save before form initializes; `saveAll()` silently bails (`if (!latestForm) return false`). Fix: disable Save button until form is loaded; OR throw a visible error if `saveAll()` is called with null form.

### Medium
- [x] **`useCompletionPolling` ignores all errors — 401/500 spins for 3 minutes silently.** [src/hooks/useCompletionPolling.ts](src/hooks/useCompletionPolling.ts). ✅ FIXED 2026-07-12 (U-005): catch now branches on the structured `ApiError.status` — 404 keeps polling, any other HTTP status stops with a clear error surfacing `err.detail`, network/no-status stays transient. Also added a per-start generation guard so overlapping/stale polls can't clobber a terminal state (found in review). 10 vitest specs (`useCompletionPolling.test.ts`) cover 404/401/500/200/transient/timeout/overlap×2/stale-restart.
- [ ] **ESLint flagged: `setState` synchronously inside `useEffect` — real cascading-render bug.** [src/hooks/usePaginatedList.ts:190](src/hooks/usePaginatedList.ts) and [src/hooks/useViewAttachmentObjectUrl.ts:19](src/hooks/useViewAttachmentObjectUrl.ts).
- [ ] **`FolderPicker.tsx:76` `useEffect` missing dep `browseFolderItems`** — stale closure on re-render. Either include the dep or memoize the callback.
- [ ] **File upload validates MIME type only, not size.** [src/pages/bills/BillCreate.tsx:34-44](src/pages/bills/BillCreate.tsx). Big uploads time out with a vague network error. Add a `file.size` check (e.g. 50 MB) with a clear inline error.
- [ ] **`Sidebar.tsx:27` route fallback `/{mod.name.toLowerCase()}` mismatches actual `/{entity}/list` routes when `Module.route` is null.** Fix the fallback OR enforce `Module.route` non-null on the API side.
- [x] **No `<ErrorBoundary>` wrapping any page.** Render error = blank screen + console log + no recovery. Wrap routes (or the entire `<Outlet />`) in a class-component ErrorBoundary that shows an inline fallback + reload button. — DONE (U-009, 2026-07-13): `src/components/ErrorBoundary.tsx` (class boundary, `console.error` logs, theme-aware `SectionCard`/`ios-page` fallback + Reload; `RouteErrorBoundary` resets on `location.pathname` change without remounting healthy pages). Wraps the `<Outlet/>` in all three shells (AppLayout + BillLayout + BudgetLayout) + a top-level backstop `<ErrorBoundary>` in `App.tsx` covering `/login` + providers. Vitest at `src/components/ErrorBoundary.test.tsx`. Codex PASS.
- [ ] **`computeLineItem` uses JS `Number()` arithmetic for currency.** [src/pages/bills/BillEdit.tsx:39-50](src/pages/bills/BillEdit.tsx). UI totals drift from server on edge cases. Use a small decimal library or carry values as strings until display.
- [ ] **`useAutoSave.flush()` swallows save errors.** [src/hooks/useAutoSave.ts:29-38](src/hooks/useAutoSave.ts). Return success/failure (or throw) so callers know.
- [x] **InlineContacts delete has no `saving` guard / inline error persistence** — rapid clicks trigger duplicate deletes; transient error message can be lost. — DONE (U-010, 2026-07-13): `handleDelete` now mirrors the sibling `handleAdd`/`handleUpdate` pattern — keeps the `confirm()`, then `if (saving) return` + `setError("")` + `setSaving(true)` at the top, `del()` + optimistic `setContacts` filter on success, `setError(err.message)` in `catch`, `setSaving(false)` in `finally`. Both Edit + Del buttons now carry `disabled={saving}` (matches Save/Add), so no delete/edit/add interleave. Error surface = existing `{error && <div className="form-error">}` under the Contacts header; `setError("")` on delete-start fixes stale-message persistence. tsc + build + 92/92 vitest green (incl. 5 cacheCleanup specs). Codex (gpt-5.5, xhigh) PASS, zero findings.

### Low
- [ ] **Extract a shared `renderHook` test harness.** `useCompletionPolling.test.ts` and `useAutoSave.test.ts` each define an identical `createRoot`+`TestComponent` hook-render harness (+ `deferred`/`drain` helpers). Hoist to a `src/hooks/__testutils__` (or similar) so new hook specs reuse it. Deferred from U-005.
- [ ] InlineContacts edit row: no Escape-key handler to cancel edit. Minor UX.
- [ ] **215 `@typescript-eslint/no-explicit-any` errors** across `src/pages/*` — not bugs themselves but a risk amplifier; real type-mismatches survive type-check. Sweep over time.
- [ ] **[U-005] Expense Coding Cockpit — per-keystroke full-list re-render (only if typing lag appears).** Editor `selections` state lives in the parent, so each keystroke in an expanded row re-runs `rows.map`, re-rendering all N `QueueRowCard`s (unpaginated queue → ~441 at the backlog). Imperceptible at ~1–2/day + a one-time backlog (collapsed cards are trivial, no DOM mutations), so NOT actioned. If typing lag is ever observed, the fix is to memo `QueueRowCard` + stabilize its `selection`/callback props, or localize the editor's transient state to the expanded card and lift only on Confirm (mind the "selections entry == dirty" invariant). Also unpaginated `/expense-coding/queue` — add server paging if the queue grows large.

---
