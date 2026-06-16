# TODO — build.one.web

Pending work, deferred decisions, known issues. Check off as done; prune anything stale.

---

## PWA — Tier 2 / Tier 3 decision gates

- [ ] **JWT-in-localStorage durability on installed PWAs.** Surfaced 2026-06-15 (Phase 1.9). iOS Safari may evict localStorage from standalone PWAs after ~7 days of non-use, silently logging the user out. Documented as a Tier 1 known limitation. Long-term fix is migrating refresh tokens to httpOnly cookies + access tokens to in-memory only; that's a separate auth-durability project with CORS + CSRF implications. Do NOT bundle into PWA Tier 2/3 work — flag it, then decide independently. Triggers: complaints from installed-PWA users about unexpected sign-outs, or once Tier 2 lands and the surface becomes more "app-like" in expectation.
- [x] **Tier 2 — offline reads** shipped 2026-06-15 same session as Tier 1. Persistent React Query cache via `@tanstack/react-query-persist-client` + `idb-keyval` with user-scoped persister key; multi-user safety contract enforced via `clearAllUserScopedStorage` + awaited logout + login reload (5-spec Vitest regression test at `src/auth/cacheCleanup.test.ts`). NetworkFirst SW routes for `/api/v1/get/*`, `/api/v1/list/*`, `/api/v1/lookups*`, `/api/v1/*/by-*`. OfflineBanner shows "Synced X ago". Storage readout in Profile → Appearance. See `docs/pwa-tier2.md`.
- [ ] **Tier 3 decision gate — local-first writes.** Conditional, not committed. Greenlight Tier 3 (~10 weeks server + client) only if (a) >20% of mutations are attempted while OfflineBanner is visible (instrument via telemetry after Tier 2 lands), (b) PMs ask for browser-side offline writes specifically, or (c) Android tablets / Chromebooks come on the roadmap. Otherwise mark "deferred indefinitely" — iOS already owns the offline-write surface for field users. Server-side prerequisite (`dbo.IdempotencyKey` table + middleware on every mutation route, ~3 weeks) has independent value for iOS hardening even if Tier 3 itself is deferred.
- [ ] **Theme-color + manifest colors.** ~~Was the deferred Phase 6 follow-up from the initial mobile-shell work.~~ Folded into PWA Tier 1 Phase 1.2 — `theme_color` is now `#1a1816` (charcoal) and `background_color` is `#f4f2ee` (warm cream) in both `index.html` and the manifest emitted from `vite.config.ts`. Close.

---

## Auth / authz hardening — API repo follow-ups (from 2026-06-16 evaluation)

The full auth+authz evaluation lives in the workflow transcript at
`/private/tmp/claude-501/-Users-chris-Applications-build-one/7b4ffd2a-28ac-4754-9941-d5889b92a8cd/tasks/wuqbrmpaw.output`
(audit + risk pass across web/api/ios). Web-side Phase 0 (redirectToLogin
cleanup, Sign out of all devices, agent transcript scoping) shipped this
session. The items below are API-repo work, in priority order per the
user's answers to the open questions.

### Phase 0.5 — URGENT user-facing: refresh cookie never reaches the API (SameSite=Lax + cross-site)

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
- [ ] **`AuthContext.isAuthenticated` and `ProtectedRoute` read `localStorage` during render — non-reactive.** [src/auth/AuthContext.tsx:28](src/auth/AuthContext.tsx); [src/auth/ProtectedRoute.tsx](src/auth/ProtectedRoute.tsx). Login/logout doesn't update derived state until the component remounts. Users can land in redirect loops or blank pages. Fix: derive `isAuthenticated` from `username` state (already reactive via `setUsername`); refactor `ProtectedRoute` to use `useAuth().isAuthenticated`.
- [ ] **JWT in `localStorage` — DOM-XSS = bearer-token exfil.** [src/api/client.ts:49](src/api/client.ts); [src/auth/AuthContext.tsx:37,62](src/auth/AuthContext.tsx). CSRF cookie is correctly httpOnly; the access token isn't. Long-term fix: move JWT to httpOnly cookie (requires API changes). Interim: tight CSP headers + remove every `dangerouslySetInnerHTML` usage.
- [ ] **Logout clears only `["me"]` query from React Query cache.** [src/auth/AuthContext.tsx:69-75](src/auth/AuthContext.tsx). User A's vendor/project/bill caches remain visible to User B until refresh. Fix: `queryClient.clear()` on logout.
- [ ] **Complete/Delete handlers missing `finally { setX(false) }`.** [src/pages/bills/BillEdit.tsx:221-233](src/pages/bills/BillEdit.tsx); [src/pages/expenses/ExpenseEdit.tsx:204-217](src/pages/expenses/ExpenseEdit.tsx); [src/pages/invoices/InvoiceEdit.tsx:198-210](src/pages/invoices/InvoiceEdit.tsx). Success path leaves the button stuck disabled; potential setState-on-unmounted-component warning when navigation fires. Same pattern on `BillCreate.tsx:46-80` (saving). Fix: wrap each in `try { ... } finally { setX(false); }` (and bail with a mounted ref check if needed).
- [ ] **Bill complete missing `await flushAutoSave()` before `saveAll()`.** Expense does it (`ExpenseEdit.tsx:206`), Bill + Invoice don't. Auto-save race vs. complete persists. Fix: call `flushAutoSave()` (or equivalent) first.
- [ ] **`BillEdit.tsx:69-71` formRef captured null before initialization** — fast user can tap Save before form initializes; `saveAll()` silently bails (`if (!latestForm) return false`). Fix: disable Save button until form is loaded; OR throw a visible error if `saveAll()` is called with null form.

### Medium
- [ ] **`useCompletionPolling` ignores all errors — 401/500 spins for 3 minutes silently.** [src/hooks/useCompletionPolling.ts:32-58](src/hooks/useCompletionPolling.ts). Distinguish 404 (not ready) from 401/403/500 (real error) and stop polling on the latter with a clear error state.
- [ ] **ESLint flagged: `setState` synchronously inside `useEffect` — real cascading-render bug.** [src/hooks/usePaginatedList.ts:190](src/hooks/usePaginatedList.ts) and [src/hooks/useViewAttachmentObjectUrl.ts:19](src/hooks/useViewAttachmentObjectUrl.ts).
- [ ] **`FolderPicker.tsx:76` `useEffect` missing dep `browseFolderItems`** — stale closure on re-render. Either include the dep or memoize the callback.
- [ ] **File upload validates MIME type only, not size.** [src/pages/bills/BillCreate.tsx:34-44](src/pages/bills/BillCreate.tsx). Big uploads time out with a vague network error. Add a `file.size` check (e.g. 50 MB) with a clear inline error.
- [ ] **`Sidebar.tsx:27` route fallback `/{mod.name.toLowerCase()}` mismatches actual `/{entity}/list` routes when `Module.route` is null.** Fix the fallback OR enforce `Module.route` non-null on the API side.
- [ ] **No `<ErrorBoundary>` wrapping any page.** Render error = blank screen + console log + no recovery. Wrap routes (or the entire `<Outlet />`) in a class-component ErrorBoundary that shows an inline fallback + reload button.
- [ ] **`computeLineItem` uses JS `Number()` arithmetic for currency.** [src/pages/bills/BillEdit.tsx:39-50](src/pages/bills/BillEdit.tsx). UI totals drift from server on edge cases. Use a small decimal library or carry values as strings until display.
- [ ] **`useAutoSave.flush()` swallows save errors.** [src/hooks/useAutoSave.ts:29-38](src/hooks/useAutoSave.ts). Return success/failure (or throw) so callers know.
- [ ] **InlineContacts delete has no `saving` guard / inline error persistence** — rapid clicks trigger duplicate deletes; transient error message can be lost.

### Low
- [ ] InlineContacts edit row: no Escape-key handler to cancel edit. Minor UX.
- [ ] **215 `@typescript-eslint/no-explicit-any` errors** across `src/pages/*` — not bugs themselves but a risk amplifier; real type-mismatches survive type-check. Sweep over time.

---
