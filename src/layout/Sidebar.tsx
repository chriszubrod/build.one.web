import { NavLink } from "react-router-dom";

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">Build One</div>

      <ul className="sidebar-nav">
        <li>
          <NavLink
            to="/time-entry/list"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Time
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/profile"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Profile
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
