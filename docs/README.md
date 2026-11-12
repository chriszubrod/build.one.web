# web docs — index

Added 2026-11-11 (U-788).

| path | what it is |
|---|---|
| [`conventions/`](conventions/) (7) | **standing rules**, extracted from `CLAUDE.md` so it stays ~15 KB. Binding, not history — CLAUDE.md keeps the one-line rule and links here |
| [`archive/2026/`](archive/2026/) | historical. The Jinja→React migration tiers; nothing needs action |
| [`deploy.md`](deploy.md) | Azure Static Web Apps deploy. ⚠️ **web ships only on an explicit ask** — it is deliberately not part of the end-of-session deploy offer |
| [`pwa-tier1.md`](pwa-tier1.md) | PWA tier 1 — installability, offline shell |
| [`pwa-tier2.md`](pwa-tier2.md) | PWA tier 2 — background sync, push |

The `/docs` **surface** the app serves (admin-only, LIVE/DERIVED/CURATED freshness
badges) is not this folder — it is built from `src/docs/`, and the iOS section is
generated: `python3 scripts/gen_docs_manifest.py` in `build.one.ios`, then
`npm run docs:sync:ios` here. See the repo `CLAUDE.md`.
