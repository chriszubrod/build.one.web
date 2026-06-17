import { NavLink } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { primarySlotsForUser } from "./menuConfig";

/**
 * Desktop / tablet sidebar. Renders the same curated primary slots as
 * BottomTabBar — `primarySlotsForUser(me)` is the single source of truth.
 *
 * CSS shows this sidebar at the tablet+ breakpoint (`min-width: 768px`
 * post-Nav-Phase-0.5). BottomTabBar fills the phone column below.
 */
export default function AppSidebar() {
  const { data: me } = useCurrentUser();
  const slots = primarySlotsForUser(me);

  return (
    <aside className="app-sidebar" role="navigation" aria-label="Primary">
      <div className="app-sidebar-brand">Build One</div>
      <nav className="app-sidebar-nav">
        {slots.map((entry) => {
          const Icon = entry.icon;
          return (
            <NavLink
              key={entry.id}
              to={entry.route}
              className={({ isActive }) =>
                `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
              }
            >
              <Icon size={18} strokeWidth={2} />
              <span>{entry.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
