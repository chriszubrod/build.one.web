import { NavLink } from "react-router-dom";

/**
 * Bill-scoped desktop sidebar — AP's completion workflow gets its own
 * desktop chrome with a back-link to the field app.
 */
export default function BillSidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">Build One</div>
      <ul className="sidebar-nav">
        <li>
          <NavLink
            to="/bill/list"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Bills
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
