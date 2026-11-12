# Page, route and edit-page conventions

How a page is laid out, and the save/flush, join-table, scroll and tab-link rules that go with it.

> Extracted verbatim from `CLAUDE.md` on 2026-11-11 (U-788) to take it off the
> per-session load. **Standing rules, not history** — they bind the same as before.
> CLAUDE.md keeps the one-line rule and links here.

---


- **Page pattern**: Each entity gets a folder under `src/pages/` with up to 4 files: `List.tsx`, `View.tsx`, `Edit.tsx`, `Create.tsx`
- **Route pattern**: Match the existing URL structure from Jinja2 — `/{entity}/list`, `/{entity}/{id}`, `/{entity}/{id}/edit`, `/{entity}/create`
- **User entity is a single Profile page (2026-04-29).** `/user/:id` and `/user/:id/edit` both render `pages/users/UserProfile.tsx` (the old `UserView` + `UserEdit` split was retired). Sections: Profile basics, Credentials (admin only — POSTs to `/api/v1/admin/auth/set-credentials/:id`), Contacts (`<InlineContacts>`), Organizations, Companies, Roles, Modules, Projects. Admin gating reads `is_admin` from `useCurrentUser()` — non-admins see read-only sections with no add/remove/save controls. Companies dropdown is filtered to companies linked to the user's Organizations via the `OrganizationCompany` join. If no orgs are linked to companies yet, the empty-state hint renders inline `<Link>`s to each Organization's edit page.
- **No state management library**: Use React state + context. Add Zustand or similar only if complexity demands it.
- **Join-table pages resolve FK ids client-side.** UserRole, RoleModule, UserOrganization, UserCompany and OrganizationCompany carry FK ids, not names, so the consuming page loads lookup maps (`role_map`, `module_map`, `organization_map`, `company_map`) to render them. ⛔ **Dropdown values use the entity's `public_id` (UUID), but a POST body passes the internal `id` (BIGINT) for an FK column** — the two are not interchangeable and the API will not coerce one into the other.
- **Scroll restoration targets `#content`, never `window`.** `<main id="content">` in `layout/AppLayout.tsx` is the canonical scroll container for everything under `AppLayout`, so `window.scrollY` / `window.scrollTo()` read and move the wrong element. The working shape (`pages/time-entry/TimeEntryList.tsx`): save `#content.scrollTop` to `sessionStorage` on a **plain** row-link click (bail on meta/ctrl/shift/alt and any non-primary button — those open a new tab and must not clobber the saved position); restore in an effect gated on the data having arrived, once only via a ref, inside a **double** `requestAnimationFrame` (one frame is not enough — the rows are not laid out yet), then `removeItem` so a later fresh navigation starts at the top. Wrap every `sessionStorage` call in try/catch; it throws in private mode.
- **Review actions belong on View pages too (2026-10-03).** `ReviewTimeline` takes `readOnly` (pass it only for a terminal status), optional `onBeforeAction` (Edit pages: flush + save first), optional `onAfterAction` (View pages: react to the transition, e.g. ExpenseView opens the next draft), and optional `onAfterSubmit` (Edit-only navigation after submit, e.g. BillEdit → list). A View page needs no pre-save because nothing on it is editable — do not route users through Edit just to submit.
- **Edit pages write only what changed.** Track header/line dirtiness and let `saveAll` return early on a clean form; each entity/line PUT is a ProcessEngine workflow with audit rows. Always `await flushAutoSave()` (never only `cancelAutoSave()`) before an action that depends on persisted state — Complete, Delete, **Submit for Review**. Edit pages debounce saves at **300ms**, and ⛔ **cancelling the timer is not enough**: an in-flight PUT still races the action's own PUT **on the same `row_version`**, so the loser 409s or silently loses the edit. ExpenseEdit had exactly this (fixed 2026-10-03). See ExpenseEdit / BillEdit.
- **List links carry the user's tab.** A bare `/expense/list` resolves to the default (Draft, since U-752) tab; use `expenseListPath(status)` from `expenseStatusTabs.ts` (and the equivalent for other tabbed lists) on breadcrumbs and Cancel targets.
- **CSS**: Single `index.css` with CSS custom properties. No CSS-in-JS, no Tailwind (yet). Use semantic class names.
- **Types**: Define in `src/types/api.ts`. Keep in sync with API Pydantic schemas manually for now. `CurrentUser` now includes `accessible_project_ids: number[]` (informational; no enforcement wired yet).

