import { NavLink } from "react-router-dom";
import { Clock, HardHat, User, Wallet } from "lucide-react";
import { useCurrentUser } from "../hooks/useCurrentUser";

const CONTRACT_LABOR_MODULE = "Contract Labor";
const BUDGETS_MODULE = "Budgets";

/**
 * Desktop sidebar (≥1281px). Mirrors the BottomTabBar nav structure +
 * permission gating, just rendered vertically. CSS hides this below the
 * desktop breakpoint; BottomTabBar takes over for mobile + tablet.
 */
export default function AppSidebar() {
  const { data: me } = useCurrentUser();
  const showLabor = !!(
    me?.is_admin ||
    me?.modules?.find((m) => m.name === CONTRACT_LABOR_MODULE)?.can_read
  );
  const showBudgets = !!(
    me?.is_admin ||
    me?.modules?.find((m) => m.name === BUDGETS_MODULE)?.can_read
  );

  return (
    <aside className="app-sidebar" role="navigation" aria-label="Primary">
      <div className="app-sidebar-brand">Build One</div>
      <nav className="app-sidebar-nav">
        <NavLink
          to="/time-entry/list"
          className={({ isActive }) =>
            `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
          }
        >
          <Clock size={18} strokeWidth={2} />
          <span>Time Tracking</span>
        </NavLink>
        {showLabor && (
          <NavLink
            to="/labor/list"
            className={({ isActive }) =>
              `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
            }
          >
            <HardHat size={18} strokeWidth={2} />
            <span>Contract Labor</span>
          </NavLink>
        )}
        {showBudgets && (
          <NavLink
            to="/budget/list"
            className={({ isActive }) =>
              `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
            }
          >
            <Wallet size={18} strokeWidth={2} />
            <span>Budgets</span>
          </NavLink>
        )}
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `app-sidebar-link${isActive ? " app-sidebar-link-active" : ""}`
          }
        >
          <User size={18} strokeWidth={2} />
          <span>Profile</span>
        </NavLink>
      </nav>
    </aside>
  );
}
