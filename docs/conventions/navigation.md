# Navigation architecture

`menuConfig.ts` is the single source of truth for both nav surfaces. Includes the U-046 bug this shape exists to prevent, and the `MoreDrawer` containing-block trap.

> Extracted verbatim from `CLAUDE.md` on 2026-11-11 (U-788) to take it off the
> per-session load. **Standing rules, not history** — they bind the same as before.
> CLAUDE.md keeps the one-line rule and links here.

---

## Navigation architecture

Single source of truth: `src/layout/menuConfig.ts`. Both `BottomTabBar`
(mobile/tablet) and `AppSidebar` (desktop) render `primarySlotsForUser(me)`
for the primary tier, then `secondarySectionsForUser(me)` for everything
else (U-046, 2026-07-16).

`secondarySectionsForUser` is the single source of truth for "what is NOT
on the primary nav for this user": it composes `entriesInSection` (RBAC
gating) over `SECONDARY_SECTION_SPECS`, drops any entry already occupying
a primary slot (so Profile/Projects never double-list), and omits empty
sections. **Both** surfaces must consume it — do not hand-maintain a
per-surface section list. That is exactly the bug U-046 fixed: BottomTabBar
and AppSidebar each kept their own list and both omitted `contacts`, so
Vendors/Customers were URL-only on every breakpoint. A test tripwire in
`menuConfig.test.ts` now fails if a `MENU_ENTRIES` section is missing from
the spec list.

`MoreDrawer` (bottom sheet) renders those sections on mobile; `BottomTabBar`
shows its "More" slot only when the helper returns ≥1 section, so the
trigger can never open an empty drawer. **`MoreDrawer` must stay mounted
OUTSIDE `<nav className="app-tabbar">`** — that pill has
`transform: translateX(-50%)`, and a transformed ancestor becomes the
containing block for `position: fixed` descendants, which would clip the
sheet to the pill instead of the viewport. `BottomTabBar.test.tsx` pins
this as a DOM-tree assertion.

Module name constants live in `src/shared/modules.ts`
— mirror of `build.one.api/shared/rbac_constants.py`. Never use the raw
module-name string literals (`"Contract Labor"`, etc.) anywhere a value is
compared against `dbo.Module.Name` — nav code, permission gates, module
filters alike; typos on a literal silently hide entries while typos on a
constant fail compilation.

