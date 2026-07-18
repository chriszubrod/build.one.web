import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  isEntryRouteActive,
  primarySlotsForUser,
  secondarySectionsForUser,
  type MenuEntry,
} from "./menuConfig";

function sidebarLink(entry: MenuEntry, pathname: string): ReactNode {
  const Icon = entry.icon;
  const active = isEntryRouteActive(entry, pathname);
  return (
    <Link
      key={entry.id}
      to={entry.route}
      className={`app-sidebar-link${active ? " app-sidebar-link-active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={2} />
      <span>{entry.label}</span>
    </Link>
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
  const { pathname } = useLocation();
  const slots = primarySlotsForUser(me);
  const secondary = secondarySectionsForUser(me);
  const renderLink = (entry: MenuEntry) => sidebarLink(entry, pathname);

  return (
    <aside className="app-sidebar" role="navigation" aria-label="Primary">
      <div className="app-sidebar-brand">Build One</div>
      <nav className="app-sidebar-nav">
        {slots.map(renderLink)}
        {secondary.map((sec) => (
          <div key={sec.section} className="app-sidebar-section">
            <div className="app-sidebar-section-label">{sec.label}</div>
            {sec.entries.map(renderLink)}
          </div>
        ))}
      </nav>
    </aside>
  );
}
