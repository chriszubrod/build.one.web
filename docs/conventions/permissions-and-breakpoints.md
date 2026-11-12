# Permissions (UI gating) + breakpoint tiers

`hasModulePermission` is the only client-side mirror of the API's `require_module_api`. Also the breakpoint tiers, curated primary slots, and the landing route.

> Extracted verbatim from `CLAUDE.md` on 2026-11-11 (U-788) to take it off the
> per-session load. **Standing rules, not history** — they bind the same as before.
> CLAUDE.md keeps the one-line rule and links here.

---

## Permissions (RBAC gating in the UI)

`src/shared/permissions.ts::hasModulePermission(me, module, permission)` is
the **single** client-side mirror of the API's
`require_module_api(module, permission)`, system-admin bypass included.
Three standing rules (U-105 shipped the primitive; U-108 retired the last
inline check — there are now zero `me.modules?.find(...)` permission
lookups in `src/`, and it should stay that way):

1. **Never hand-roll the lookup.** Call `hasModulePermission` directly, or an
   entity wrapper (`src/pages/bills/billPermissions.ts`,
   `src/pages/time-entry/timeEntryPermissions.ts`). Add a wrapper only when a
   gate needs a *name*, a composite rule, or a contract note — a bare one-off
   flag read is clearer inline.
2. **Gate on the permission that action's route actually enforces, and cite
   the route in a comment.** Getting this wrong is the live bug class here,
   in both directions: gating on too weak a permission offers a button that
   403s (U-108: TimeEntryView gated Approve/Reject on `can_update` when
   `/approve` + `/reject` enforce `can_approve`); gating on too strong a one
   hides an action the API allows. Check the router — don't infer from the
   button's label.
3. **Mind compound actions.** If a handler pre-saves before its headline call
   (Complete, Submit, "Save & Activate"), it needs the save's permission **in
   addition** to its own — see `resolveBillEditActions`, which encodes exactly
   that for BillEdit.

Nothing enforces web↔API parity yet; a cross-repo route→permission parity
test is tracked in `TODO.md`.

Breakpoint tiers (2026-06-17 flip):
- **Mobile portrait** (default, < 768w): `.app-shell` is a 430px column,
  BottomTabBar floating pill visible, AppSidebar hidden.
- **Tablet + Desktop** (≥ 768w): sidebar + main row, BottomTabBar hidden.
  Previously gated on `(min-width: 1024px) and (hover: hover) and
  (pointer: fine)` — left iPad PMs in the 430px phone column. iPad
  portrait may feel cramped at 768; an opt-out under
  `(orientation: portrait) and (max-width: 820px)` is documented in
  index.css for the future if needed.
- **Mobile landscape** (`(orientation: landscape) and (max-height: 500px)`):
  rotate overlay (RotateOverlay component).

Primary slots are CURATED per role in `PRIMARY_SLOTS_BY_ROLE`
(menuConfig.ts). Phase 1+ extends each role's list as financial entities
unpark. **Do NOT gate any menuConfig entry on a hardcoded role name
string at the consumer level** — gate on module read perms or
`is_admin` only. Role names are RBAC-table mutable; gating on them
creates silent breakage if Ops renames a role.

Landing route: `LandingRedirect` resolves `/` and `*` to either Time
Tracking or Profile based on `Time Tracking.can_read` (with
`is_admin` bypass). System admins land on Time. Field workers without
Time grant land on Profile.

For the full nav strategy + Phase 1+ roadmap, see TODO.md "Nav strategy"
section.

