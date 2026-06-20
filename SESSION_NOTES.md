# Session Notes — build.one.web

Chronological session history. Newest at the top.

---

## Session: Admin /docs surface — iOS-first (2026-06-20)

Shipped v1 of an **admin-only `/docs`** surface — a Hybrid docs site documenting the whole 5-repo application, freshness-badged per repo (LIVE / DERIVED / CURATED). Decision: **iOS-first** (the hardest repo: can't be runtime-introspected from web). Built on native primitives (`ios-page` / `SectionCard` / `ListRow` / `NavHeader`) as a drill-down (`DocsHome` → section), matching Time/Labor/Profile. Routes are `React.lazy`-split in `App.tsx` (keeps react-markdown out of the main bundle). Dual-gated: `menuConfig` `requiresAdmin` + page `is_admin` guard; surfaced via a **new Reference group in `AppSidebar`** — NOT the primary bottom pill (which would overflow at 5 tabs).

**iOS section** = DERIVED facts (version/build, features, services, endpoints, CoreData entities + user-scoping, privacy) vendored from `build.one.ios` via its new `scripts/gen_docs_manifest.py` + `npm run docs:sync:ios` (new `scripts/sync-ios-docs.mjs`), plus CURATED narrative (`build.one.ios/docs/app-guide/*.md`) and a build-time snapshot/staleness banner. API/Web/MCP/Scheduler are listed as "coming soon" so the IA is visible.

**Files (new):** `src/pages/docs/*` (DocsPage, DocsHome, FreshnessBadge, DocsMarkdown, docsSections, iosManifest, types, `sections/{IOSDocs,ComingSoon}`), `src/docs/ios/*` (vendored), `scripts/sync-ios-docs.mjs`. **(edited):** `App.tsx` (lazy routes), `layout/{menuConfig,AppSidebar}.tsx` + `menuConfig.test.ts`, `index.css`, `package.json` (`docs:sync:ios`).

**Process:** designed via a fan-out workflow (3 architectures → Hybrid). Two-pass adversarial review (16-agent workflow): 7 confirmed findings, all fixed — privacy `{}` → crash, `JSON.parse` boot-crash guard, `min_ios` variable-token filter, 5-tab pill overflow → Reference section, code-split `/docs`, vendoring automation. `tsc` clean · **28 tests** · build green with `/docs` in its own chunk. Pushed to `main` (`c42c94b`).

**Standing rule added:** `/docs` must be kept current as features change — it's now the **Docs** step of the per-unit pipeline (see `CLAUDE.md` "Documentation surface" + umbrella memory `feedback_docs_keep_current.md`). Next increment: the **API live section** (`/openapi.json` + registries behind `require_system_admin`).

## Session: Budget UI — Phase 3 (2026-06-13)

Built the Budget web UI against the live backend (API Phases 0–2 shipped 2026-06-11/12; plan at umbrella memory `project_budget_entity.md`). Customer-facing contract value per project, original schedule of values + change-order deltas, with a budget-vs-actual-vs-drawn variance consolidation.

**Layout decision realized:** budgets are the first non-phone surface since the v0.1.0 trim. New `BudgetLayout` (desktop chrome: revived `.app-layout` + `BudgetSidebar` + reused `Header`) is a sibling of the phone `AppLayout` under `ProtectedRoute`. Static `/budget/*` routes outrank AppLayout's `*` splat in react-router v7, so no ordering hazard. Field workers never get the Budgets module grant → never reach it. A `Budgets` tab was added to `BottomTabBar` gated on `module 'Budgets' can_read` (the cross-layout entry point).

**Files (new):** `src/api/budget.ts` (typed endpoint wrappers + react-query keys + `fmtMoney`/`signClass`/status helpers — endpoint strings live here only), `src/layout/BudgetLayout.tsx` + `BudgetSidebar.tsx`, `src/pages/budgets/{BudgetList,BudgetCreate,BudgetView,BudgetEdit}.tsx` + `budget.css`. **(edited):** `src/types/api.ts` (Budget* types appended), `src/App.tsx` (route group), `src/layout/BottomTabBar.tsx`, `src/components/PageHeader.tsx` (button `type`).

**Pages:** List (DataTable + server rollups: contract/drawn/remaining). Create (project picker + notes → auto-creates Rev 0 → lands on edit). View (variance consolidation grouped CostCode→SubCostCode with subtotals + grand totals + 6 money columns: Budget Cost / Actual Cost / Cost Var / Contract / Drawn / Remaining; revisions panel; inline notes edit; "+ Change Order"). Edit (`.li-card` SCC line grid — BillEdit pattern, manual saveAll not autosave; CO metadata; terminal "Save & Activate" for draft Rev 0 / "Save & Approve" for draft CO).

**Conventions followed:** live react-query (not the parked `useEntity` hooks); money is string on the wire, displayed via `fmtMoney`, **never** client-computed for stored values (only the qty×rate / amount×(1+markup) display compute in the editor, mirroring BillEdit); `row_version` threaded as opaque base64 — activate uses the BUDGET row_version (line saves never bump it), approve uses the REVISION row_version (advanced by metadata PUTs). RBAC gating mirrors the API grants (create / update / approve), so read-only users see no dead buttons; server enforces regardless.

**Verification:** `tsc -b` + `vite build` + `eslint` all clean. **Live contract probe** against prod (created a temp budget, dumped every endpoint's JSON keys, cleaned up): all six read payloads' keys match the hand-mirrored TS types exactly — zero drift. 3-agent adversarial review (contract / logic / UX): zero contract findings; all logic + UX findings applied (notes-save refetch-on-409 for fresh row_version, awaited line-item invalidate, `type="button"` hygiene, CSS fallback alignment). Both "blocker"-tagged logic items were the reviewer *confirming* the budget-vs-revision row_version threading is correct.

**Not done / notes:** Uncategorized variance row is large today (QBO-pulled invoice lines carry no SCC) — surfaced with an advisory banner; read drawn per-budget not per-cost-code until those lines are categorized. No EmployeeLabor data in prod yet (EL variance leg unexercised). The budget surface is desktop; on a phone the `.app-layout` is cramped but the gated audience is office/desktop. SWA deploy (app.bld-one.com) ships this to anyone with the Budgets grant.

---

## Session: Multi-repo audit — Web findings (2026-05-20)

Read-only SRE-style audit across all 5 sub-repos. Web findings now in this repo's TODO.md under "Audit 2026-05-20 — Web findings". Full audit memory at `~/.claude/projects/-Users-chris-Applications-build-one/memory/project_audit_2026_05_20.md`.

### Highest-severity web findings
- **HIGH:** `AuthContext.isAuthenticated` + `ProtectedRoute` read localStorage during render → non-reactive on login/logout. Real impact: redirect loops or blank pages after login.
- **HIGH:** JWT in `localStorage` (vs httpOnly cookie) = DOM-XSS exfil target. CSRF cookie is httpOnly, the JWT isn't.
- **HIGH:** Logout clears only `["me"]` from React Query cache → User A's vendor/project caches visible to User B.
- **HIGH:** Bill/Expense/Invoice Complete + Delete handlers all missing `finally { setX(false) }`. Success path leaves the button stuck disabled.
- **HIGH:** Bill Complete doesn't flush auto-save first (Expense does). Auto-save race vs. complete persists.

### Validation
- `tsc --noEmit`: **PASS**.
- `eslint`: 215 errors + 1 warning. 215 are `Unexpected any` (style/type-safety erasure, not bugs). Real flagged items: `usePaginatedList.ts:190` + `useViewAttachmentObjectUrl.ts:19` `setState` in `useEffect` (cascading-render bug); `FolderPicker.tsx:76` `useEffect` missing dep (stale closure).

### Followups expected next session
User prioritized iOS first. Web Tier-1 fixes from the audit:
1. Add `finally { setX(false) }` to every Complete/Delete handler.
2. Make `AuthContext.isAuthenticated` reactive (derive from `username` state).
3. `queryClient.clear()` on logout.
4. Fix `useCompletionPolling` to surface 401/403/500 distinctly from 404.
5. Wrap routes in `<ErrorBoundary>`.
