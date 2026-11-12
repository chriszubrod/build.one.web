# Jinja2 -> React migration tiers (historical)

The priority-ordered entity tiers from the Phase-4 migration plan, cut out of
`CLAUDE.md` on 2026-11-11 (U-788). **Nothing here needs action — the migration is
done:** `build.one.api/templates/` no longer exists, and every tier-1/2/3 entity
listed below has a folder under `src/pages/` (42 page folders as of this cut).

Kept for provenance, and because the tiering records which entities were considered
complex and why (auto-save, line items, attachments, completion workflows) — that
judgement is still useful when touching one of them.

The per-entity checklist that lived at the end of this section is **live** and moved
to [`docs/conventions/adding-an-entity-page.md`](../../conventions/adding-an-entity-page.md).

---

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

