import { NavLink } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { primarySlotsForUser } from "./menuConfig";

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
  const slots = primarySlotsForUser(me);

  return (
    <nav className="app-tabbar" role="tablist">
      {slots.map((entry) => {
        const Icon = entry.icon;
        return (
          <NavLink
            key={entry.id}
            to={entry.route}
            className={({ isActive }) =>
              `app-tabbar-tab${isActive ? " app-tabbar-tab-active" : ""}`
            }
          >
            <Icon size={20} strokeWidth={2} />
            <span className="app-tabbar-tab-label">{entry.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
