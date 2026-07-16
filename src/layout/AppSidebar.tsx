import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  primarySlotsForUser,
  secondarySectionsForUser,
  type MenuEntry,
} from "./menuConfig";

function sidebarLink(entry: MenuEntry): ReactNode {
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
}

/**
 * Desktop / tablet sidebar. Renders the curated primary slots
 * (`primarySlotsForUser`) followed by any non-primary sections that have
 * visible entries — e.g. the admin-only Reference → Docs. This keeps admin
 * tools off the field-worker bottom pill while still surfacing them on desktop.
 *
 * CSS shows this sidebar at the tablet+ breakpoint (`min-width: 768px`).
 * BottomTabBar fills the phone column below.
 */
export default function AppSidebar() {
  const { data: me } = useCurrentUser();
  const slots = primarySlotsForUser(me);
  const secondary = secondarySectionsForUser(me);

  return (
    <aside className="app-sidebar" role="navigation" aria-label="Primary">
      <div className="app-sidebar-brand">Build One</div>
      <nav className="app-sidebar-nav">
        {slots.map(sidebarLink)}
        {secondary.map((sec) => (
          <div key={sec.section} className="app-sidebar-section">
            <div className="app-sidebar-section-label">{sec.label}</div>
            {sec.entries.map(sidebarLink)}
          </div>
        ))}
      </nav>
    </aside>
  );
}
