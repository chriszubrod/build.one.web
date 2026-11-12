# Adding an entity page

The seven-step checklist, including the cache reconciliation step that is easy to miss.

> Extracted verbatim from `CLAUDE.md` on 2026-11-11 (U-788) to take it off the
> per-session load. **Standing rules, not history** — they bind the same as before.
> CLAUDE.md keeps the one-line rule and links here.

---

### Per-entity migration checklist
For each entity migration:
1. Add TypeScript types to `src/types/api.ts`
2. Create page component(s) in `src/pages/{entity}/`
3. Add route(s) to `src/routes.tsx` (the route tree; `App.tsx` is providers/shell only — U-066)
4. Add sidebar link (automatic via modules lookup)
5. Verify end-to-end with live API
6. Check if any new API endpoints are needed (dropdowns, relationships)
7. Reconcile the caches a mutation dirties — `invalidateEntity` / `removeEntity` for the entity list+item, plus `invalidateLookups` if the entity backs a `/api/v1/lookups` key. The authoritative key set is the **field list of the `Lookups` interface** in `src/types/api.ts` (mirrors the API's `VALID_LOOKUPS`) — read it there rather than trusting a copy in prose, which drifts silently when a 13th key is added.

