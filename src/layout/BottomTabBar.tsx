import { NavLink } from "react-router-dom";
import { Clock, HardHat, User } from "lucide-react";
import { useCurrentUser } from "../hooks/useCurrentUser";

const CONTRACT_LABOR_MODULE = "Contract Labor";

export default function BottomTabBar() {
  const { data: me } = useCurrentUser();
  const showLabor = !!(
    me?.is_admin ||
    me?.modules?.find((m) => m.name === CONTRACT_LABOR_MODULE)?.can_read
  );

  // Budgets nav entry hidden 2026-06-15 per Chris. Routes under /budget/*
  // remain wired (see App.tsx) so existing bookmarks still resolve, but
  // there's no entry point from the nav until Budgets is reactivated.

  return (
    <nav className="app-tabbar" role="tablist">
      <NavLink
        to="/time-entry/list"
        className={({ isActive }) =>
          `app-tabbar-tab${isActive ? " app-tabbar-tab-active" : ""}`
        }
      >
        <Clock size={20} strokeWidth={2} />
        <span className="app-tabbar-tab-label">Time</span>
      </NavLink>
      {showLabor && (
        <NavLink
          to="/labor/list"
          className={({ isActive }) =>
            `app-tabbar-tab${isActive ? " app-tabbar-tab-active" : ""}`
          }
        >
          <HardHat size={20} strokeWidth={2} />
          <span className="app-tabbar-tab-label">Labor</span>
        </NavLink>
      )}
      <NavLink
        to="/profile"
        className={({ isActive }) =>
          `app-tabbar-tab${isActive ? " app-tabbar-tab-active" : ""}`
        }
      >
        <User size={20} strokeWidth={2} />
        <span className="app-tabbar-tab-label">Profile</span>
      </NavLink>
    </nav>
  );
}
