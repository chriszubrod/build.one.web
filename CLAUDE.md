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
3. Add route(s) to `src/App.tsx`
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
