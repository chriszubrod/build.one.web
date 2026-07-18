import { useId, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { isEntryRouteActive, primarySlotsForUser, secondarySectionsForUser } from "./menuConfig";
import MoreDrawer from "./MoreDrawer";

/**
 * Mobile / tablet bottom nav. Renders from `primarySlotsForUser(me)`
 * (src/layout/menuConfig.ts) — the curated per-role slot mapping is
 * the single source of truth. Add a new entry to menuConfig and update
 * the role's PRIMARY_SLOTS_BY_ROLE list to surface it here.
 *
 * Capped at MAX_PRIMARY_SLOTS (5) per the iOS/Android ergonomic
 * contract. Anything beyond that lives in the More drawer.
 *
 * CSS hides this pill at the desktop breakpoint; AppSidebar takes over.
 */
export default function BottomTabBar() {
  const { data: me } = useCurrentUser();
  const moreSheetId = useId();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const slots = primarySlotsForUser(me);
  const sections = secondarySectionsForUser(me);

  const drawerRouteActive = sections
    .flatMap((sec) => sec.entries)
    .some((entry) => isEntryRouteActive(entry, pathname));
  const moreActive = open || drawerRouteActive;

  return (
    <>
      <nav className="app-tabbar" role="tablist">
        {slots.map((entry) => {
          const Icon = entry.icon;
          const active = isEntryRouteActive(entry, pathname);
          return (
            <Link
              key={entry.id}
              to={entry.route}
              className={`app-tabbar-tab${active ? " app-tabbar-tab-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={2} />
              <span className="app-tabbar-tab-label">{entry.label}</span>
            </Link>
          );
        })}
        {sections.length > 0 && (
          <button
            type="button"
            className={`app-tabbar-tab${moreActive ? " app-tabbar-tab-active" : ""}`}
            aria-haspopup="dialog"
            aria-controls={open ? moreSheetId : undefined}
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
          >
            <MoreHorizontal size={20} strokeWidth={2} />
            <span className="app-tabbar-tab-label">More</span>
          </button>
        )}
      </nav>
      {sections.length > 0 && (
        /* Must stay outside .app-tabbar — that pill's transform captures fixed-position sheets. */
        <MoreDrawer id={moreSheetId} open={open} onDismiss={() => setOpen(false)} />
      )}
    </>
  );
}
