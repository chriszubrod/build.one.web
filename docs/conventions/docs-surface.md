# The admin /docs surface

What it is, how it is gated, and how the iOS section is re-vendored. It must stay current as features change — that is the Docs step of the per-unit pipeline.

> Extracted verbatim from `CLAUDE.md` on 2026-11-11 (U-788) to take it off the
> per-session load. **Standing rules, not history** — they bind the same as before.
> CLAUDE.md keeps the one-line rule and links here.

---

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
