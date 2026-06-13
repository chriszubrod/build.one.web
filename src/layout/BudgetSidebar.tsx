import { NavLink } from "react-router-dom";

/**
 * Budget-scoped desktop sidebar. The Budget surface is the first non-phone
 * page since the v0.1.0 trim, so it gets its own desktop chrome rather than
 * cramming a consolidation table into the 430px field-app shell. The orphaned
 * Sidebar.tsx is left untouched; this is budget-aware and links back to the
 * field app.
 */
export default function BudgetSidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">Build One</div>
      <ul className="sidebar-nav">
        <li>
          <NavLink
            to="/budget/list"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Budgets
          </NavLink>
        </li>
        <li>
          <NavLink to="/time-entry/list" className="">
            &larr; Field App
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
