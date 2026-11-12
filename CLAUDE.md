At the start of each session, read the API repo's SESSION_NOTES.md at `../build.one.api/SESSION_NOTES.md` for historical context.

## The work board — `build.one.team`

Unit tracking lives **outside this repo**, in the sibling `build.one.team` repo (the sixth alongside the five
product repos; `github.com/chriszubrod/build.one.team`). Read `../build.one.team/BOARD.md` at the start of a
substantive session — it is the single cross-repo view of what is in flight, and it is where work gets booked.

- Every unit carries a `U-###` id, echoed in its commit's `Unit: U-###` trailer, so any sha traces back to its
  board row and spec.
- `/em` (engineering) and `/pm` (product) are conducted from there; their role briefs live under
  `../build.one.team/engineering/` and `../build.one.team/product/`.
- ⚠️ `BOARD.md` is edited by parallel sessions. Re-read before writing, commit it by explicit pathspec, and
  never sweep another session's in-progress rows into your commit.
- It has no `CLAUDE.md`/`SESSION_NOTES.md`/`TODO.md` of its own — `BOARD.md` is its state. It is committed and
  pushed like any repo, but it is **never deployable**.

## Parallel sub-agents & worktrees

⚠️ Sessions fan out to sub-agents, and **several sessions may be working this repo at once**. Agents share one
filesystem and one git index. Full rules in the umbrella `../CLAUDE.md`; the ones that bite here:

- **Disjoint `SCOPE` per writing agent.** Read-only agents may overlap freely; two agents writing one file is
  the collision. Verify the diff against SCOPE mechanically (`--porcelain -uall` + md5), never by eye.
- **Sub-agents never commit, push, deploy, or write prod data** — they hand back a diff; the session applies it.
- **Any agent that writes code gets its own worktree**, and mutation testing ALWAYS does — in-place mutation
  injects broken code into other sessions' test runs. Worktrees live in the **umbrella's** `.worktrees/` — use
  the absolute path; a relative one lands *inside* this repo (`.worktrees/` is gitignored as a guard, U-466d):
  `git worktree add -b unit/u-<n> /Users/chris/Applications/build.one/.worktrees/u-<n> origin/main` for a
  code unit (`--detach` instead of `-b unit/u-<n>` for a throwaway mutation run), then symlink `.venv` and copy `.env`.
- ⛔ **Worktrees on durable disk, never `/tmp`** (it gets wiped mid-unit). ⛔ **The stash stack is SHARED** —
  never bare `git stash`/`pop`; push with a unique `-m` tag, `apply` by tag, drop by tag.
- **Land by fast-forward only** (U-466d): rebase onto the current `origin/main`, re-verify, then
  `git -C <worktree> push origin unit/u-<n>:main`; rejected ⇒ rebase and re-verify again, never merge. Then delete the branch.
- **Remove worktrees when done.** A stale one is a live writer, and has blocked a prod DROP before. Stale =
  branch merged **and** nothing uncommitted — HEAD on trunk is not evidence (every worktree starts there).
- **Commit by explicit pathspec, never `-A`, and verify `git show <sha> --stat` before pushing** — another
  session's uncommitted files are one careless command from your commit. ⚠️ Hunk-staged
  (`git apply --cached`) ⇒ commit with **NO** pathspec, or you re-sweep the working tree.

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
├── layout/                 — AppLayout (responsive shell), AppSidebar, BottomTabBar, menuConfig
├── pages/{entity}/         — One folder per entity (list, view, edit, create)
├── components/             — Shared UI (tables, form fields, dropdowns)
├── hooks/                  — Shared hooks (useLookups, useApi)
└── types/api.ts            — TypeScript types matching API response shapes
```


## Dev Server

```bash
npm run dev          # http://localhost:3000
npm run build        # tsc -b && vite build  — the REAL type gate
npm test             # vitest run            — but read the warning below
```

⛔ **`npx tsc --noEmit` checks ZERO files here — never use it as a gate.** Root
`tsconfig.json` is `{"files": [], "references": [...]}`, and without `-b` tsc does not
descend into referenced projects, so it exits 0 unconditionally (`--listFiles` prints
nothing). A real TS6133 once passed it and failed `npm run build`. Use
`npx tsc -p tsconfig.app.json --noEmit --incremental false` (fast, app + tests) or
`npm run build`. *(Corrected 2026-11-11, U-788 — this file documented the vacuous form.)*

⛔ **`npm test` exits 0 while failing.** Vitest 4's parallel pool drops whole files on
worker-start timeouts, and pool-level errors are not assertion failures, so they never
set the exit code — a run has read `Test Files 84 passed (84)` with `Errors 6`. Never
trust `$?` or the word "passed": **count the spec files that ran and compare to the
files on disk** (`find src -name '*.test.ts*' | wc -l` → 148 on 2026-11-11). Fewer files
than exist is a FAILED run whatever the exit code. For a number you can believe,
`npx vitest run --no-file-parallelism`.

⛔ **Dev talks directly to the PROD API.** `.env` points `VITE_API_BASE_URL` at the
Azure App Service; there is no local API process and no `/api` proxy. Every local click
that writes — create/edit/delete, a bill completion fanning out to SharePoint + QBO —
**mutates production data.** Treat dev as read-with-caution.

**Use the `client.ts` helpers, not raw `fetch("/api/...")`.** A raw relative path hits
`localhost:3000/api/...` with no proxy → 502. `getOne()` / `getList()` / `post()` /
`put()` / `del()` unwrap the envelope; use `rawRequest` for a non-envelope endpoint.

## Where the detail lives

This file is the **rule layer** — one line per standing rule, every prohibition kept
with the trap it exists to prevent. Reasoning, incident detail and component inventories
moved to `docs/conventions/` on 2026-11-11 (U-788). Nothing deleted, nothing downgraded.

| file | when to read it |
|---|---|
| [`docs/conventions/page-conventions.md`](docs/conventions/page-conventions.md) | building or editing any entity page |
| [`docs/conventions/adding-an-entity-page.md`](docs/conventions/adding-an-entity-page.md) | **adding a new entity page** — the 7-step checklist |
| [`docs/conventions/navigation.md`](docs/conventions/navigation.md) | nav, sidebar, bottom bar, `menuConfig` |
| [`docs/conventions/permissions-and-breakpoints.md`](docs/conventions/permissions-and-breakpoints.md) | gating a control, breakpoints, landing route |
| [`docs/conventions/pwa.md`](docs/conventions/pwa.md) | **before touching anything SW / cache / offline** |
| [`docs/conventions/testing-specs.md`](docs/conventions/testing-specs.md) | writing a spec that must be able to fail |
| [`docs/conventions/docs-surface.md`](docs/conventions/docs-surface.md) | the admin `/docs` surface |
| [`docs/deploy.md`](docs/deploy.md) | deploying — ⚠️ web ships only on an explicit ask |
| [`docs/README.md`](docs/README.md) | index of this repo's docs |
| [`docs/archive/2026/react-migration-tiers.md`](docs/archive/2026/react-migration-tiers.md) | historical — the Jinja→React tiers, migration complete |

## Conventions — the rules

**Pages & routes** → [detail](docs/conventions/page-conventions.md)
- One folder per entity under `src/pages/`, up to four files: `List.tsx` `View.tsx` `Edit.tsx` `Create.tsx`. Routes: `/{entity}/list`, `/{entity}/{id}`, `/{entity}/{id}/edit`, `/{entity}/create`.
- `routes.tsx` is the route tree as data importing no shell components, so `routes.test.tsx` asserts on it with zero mocks; `App.tsx` is providers/shell only (U-066).
- No state-management library (React state + context). One `index.css` with custom properties — no CSS-in-JS, no Tailwind. Types in `src/types/api.ts`, hand-synced with the API's Pydantic schemas.
- **List links carry the user's tab** — use `expenseListPath(status)` (and its equivalents) on breadcrumbs and Cancel targets, not a bare `/expense/list`.
- `/user/:id` and `/user/:id/edit` both render one `UserProfile.tsx`; admin affordances gate on `is_admin` from `useCurrentUser()`.

**Saving** → [detail](docs/conventions/page-conventions.md)
- Edit pages write only what changed — track header/line dirtiness and let `saveAll` return early on a clean form; every PUT is a ProcessEngine workflow with audit rows.
- ⛔ Always `await flushAutoSave()` before an action that depends on persisted state (Complete, Delete, **Submit for Review**). **Cancelling the 300ms timer is not enough** — an in-flight PUT still races the action's own PUT on the same `row_version`, so one of them 409s or silently loses the edit (ExpenseEdit, fixed 2026-10-03).
- A View page needs **no** pre-save (nothing on it is editable) — don't route users through Edit just to submit.
- ⛔ A dropdown value is the entity's `public_id` (UUID); a POST body passes the internal `id` (BIGINT) for an FK column. The API does not coerce between them.
- ⛔ Scroll restoration targets `#content` (`layout/AppLayout.tsx`), never `window` — `window.scrollY`/`scrollTo()` move the wrong element. Save on a plain row-link click only, restore inside a **double** `requestAnimationFrame`, then clear the key; wrap every `sessionStorage` call in try/catch.
- After a mutation, reconcile the caches it dirties (`invalidateEntity` / `removeEntity`, plus `invalidateLookups` if the entity backs a lookup). The authoritative key set is the `Lookups` interface in `src/types/api.ts` — read it there, never a copy in prose.

**Permissions** → [detail](docs/conventions/permissions-and-breakpoints.md)
- ⛔ **Never hand-roll a permission lookup.** `hasModulePermission(me, module, permission)` is the only client mirror of the API's `require_module_api`; there are zero inline `me.modules?.find(...)` checks in `src/` and it must stay that way.
- ⛔ **Gate on the permission that action's route actually enforces, and cite the route in a comment.** This is the live bug class, in both directions: too weak offers a button that 403s (U-108 gated Approve on `can_update` when `/approve` enforces `can_approve`); too strong hides an action the API allows. Read the router — don't infer from the label.
- **Compound actions need both permissions.** A handler that pre-saves before its headline call needs the save's permission too (see `resolveBillEditActions`).
- ⛔ **Never gate a `menuConfig` entry on a hardcoded role-name string.** Role names are RBAC-table mutable; gate on module read perms or `is_admin`.
- ⛔ **Never use a raw module-name literal** (`"Contract Labor"`) where it is compared against `dbo.Module.Name` — use `src/shared/modules.ts` (mirror of the API's `rbac_constants.py`). A typo on a literal silently hides entries; on a constant it fails compilation.
- Nothing enforces web↔API parity yet — a route→permission parity test is tracked in `TODO.md`.

**Navigation** → [detail](docs/conventions/navigation.md)
- `src/layout/menuConfig.ts` is the single source of truth. ⛔ **Both** surfaces (`AppSidebar`, `BottomTabBar`) must consume `secondarySectionsForUser` — never a hand-maintained per-surface list. That was U-046: each kept its own list, both omitted `contacts`, and Vendors/Customers were URL-only at every breakpoint.
- ⛔ **`MoreDrawer` must stay mounted OUTSIDE `<nav className="app-tabbar">`.** That pill is `transform`ed, and a transformed ancestor becomes the containing block for `position: fixed` descendants — the sheet would clip to the pill instead of the viewport. Pinned by a DOM-tree assertion in `BottomTabBar.test.tsx`.

**PWA / service worker** → [detail](docs/conventions/pwa.md)
- ⛔ **The multi-user safety contract is NON-NEGOTIABLE.** The persisted React Query cache is keyed per user (`bo.rq.v1.<uid>`); `logout` is async and **awaits** `clearAllUserScopedStorage()` before redirecting; `login()`/`signup()` force a full reload so boot-time keying picks up the new identity. Breaking it ships the iOS v0.1.0 multi-user state-bleed bug to web. Regression test: `src/auth/cacheCleanup.test.ts`.
- ⛔ `registerType: 'prompt'` — a new SW activates only when the user clicks Reload. **Never silent**; this is what protects installed clients from a bad deploy.
- ⛔ `navigateFallbackDenylist` must keep excluding `/api/`, `/.auth/` and `/sw-kill.html`. Re-check it whenever the SW config is touched. `/sw-kill.html` is the escape hatch for a stuck client.
- Bump `PERSISTER_BUSTER` in `src/main.tsx` whenever an entity model gains a required field.
- Mutations pre-flight `navigator.onLine` and fast-fail with the typed `OfflineError`. Tier 3 (local-first writes) is **not** shipped.

**Specs** → [detail](docs/conventions/testing-specs.md)
- ⛔ A spec that passes whether or not the code works is worse than none — it reads as coverage. The `does not clobber in-progress edits` spec shipped **four times** by copy-paste before anyone checked it could fail.
- Type through the value tracker (`setInputValue`): a bare `input.value = x` updates React's `_valueTracker`, so React suppresses `onChange` and a later `expect(input.value)` reads back the test's own write.
- Flush with timers, not microtasks (`flushUntil`) — under fake timers a React Query refetch needs a timer tick; always follow it with a hard assertion, since it returns silently on exhaustion.
- Assert propagation **before** the outcome, or "nothing changed" passes for the wrong reason. Fixture preconditions belong in `expect`s, not comments.
- ⛔ **Mutation-test anything guard-shaped before trusting it** — break the guard, confirm RED, restore (`assertGuardSurvivesSameRowRefetch` is the worked example).

**The /docs surface** → [detail](docs/conventions/docs-surface.md)
- Admin-only, lazy-loaded, dual-gated (`requiresAdmin` + a page-level `is_admin` redirect). Gating is **presentational only** — bundled content is deliberately non-sensitive.
- ⛔ **It must stay current as features change** — it cannot be maintained by hand, so refreshing it is the **Docs step of the per-unit pipeline**, not a later chore. After any iOS app-shape change: `python3 scripts/gen_docs_manifest.py` in the iOS repo, then `npm run docs:sync:ios` here.
