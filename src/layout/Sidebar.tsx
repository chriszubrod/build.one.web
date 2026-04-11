import { NavLink } from "react-router-dom";
import type { LookupModule } from "../types/api";

interface SidebarProps {
  modules: LookupModule[];
}

export default function Sidebar({ modules }: SidebarProps) {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">Build One</div>

      <ul className="sidebar-nav">
        <li>
          <NavLink to="/" end className={({ isActive }) => isActive ? "active" : ""}>
            Dashboard
          </NavLink>
        </li>
        {modules.map((mod) => (
          <li key={mod.public_id}>
            <NavLink
              to={mod.route ?? `/${mod.name.toLowerCase()}`}
              className={({ isActive }) => isActive ? "active" : ""}
            >
              {mod.name}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
