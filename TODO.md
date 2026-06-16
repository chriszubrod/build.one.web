# TODO — build.one.web

Pending work, deferred decisions, known issues. Check off as done; prune anything stale.

---

## PWA — Tier 2 / Tier 3 decision gates

- [ ] **JWT-in-localStorage durability on installed PWAs.** Surfaced 2026-06-15 (Phase 1.9). iOS Safari may evict localStorage from standalone PWAs after ~7 days of non-use, silently logging the user out. Documented as a Tier 1 known limitation. Long-term fix is migrating refresh tokens to httpOnly cookies + access tokens to in-memory only; that's a separate auth-durability project with CORS + CSRF implications. Do NOT bundle into PWA Tier 2/3 work — flag it, then decide independently. Triggers: complaints from installed-PWA users about unexpected sign-outs, or once Tier 2 lands and the surface becomes more "app-like" in expectation.
- [x] **Tier 2 — offline reads** shipped 2026-06-15 same session as Tier 1. Persistent React Query cache via `@tanstack/react-query-persist-client` + `idb-keyval` with user-scoped persister key; multi-user safety contract enforced via `clearAllUserScopedStorage` + awaited logout + login reload (5-spec Vitest regression test at `src/auth/cacheCleanup.test.ts`). NetworkFirst SW routes for `/api/v1/get/*`, `/api/v1/list/*`, `/api/v1/lookups*`, `/api/v1/*/by-*`. OfflineBanner shows "Synced X ago". Storage readout in Profile → Appearance. See `docs/pwa-tier2.md`.
- [ ] **Tier 3 decision gate — local-first writes.** Conditional, not committed. Greenlight Tier 3 (~10 weeks server + client) only if (a) >20% of mutations are attempted while OfflineBanner is visible (instrument via telemetry after Tier 2 lands), (b) PMs ask for browser-side offline writes specifically, or (c) Android tablets / Chromebooks come on the roadmap. Otherwise mark "deferred indefinitely" — iOS already owns the offline-write surface for field users. Server-side prerequisite (`dbo.IdempotencyKey` table + middleware on every mutation route, ~3 weeks) has independent value for iOS hardening even if Tier 3 itself is deferred.
- [ ] **Theme-color + manifest colors.** ~~Was the deferred Phase 6 follow-up from the initial mobile-shell work.~~ Folded into PWA Tier 1 Phase 1.2 — `theme_color` is now `#1a1816` (charcoal) and `background_color` is `#f4f2ee` (warm cream) in both `index.html` and the manifest emitted from `vite.config.ts`. Close.

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
