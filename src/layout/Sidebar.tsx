import { NavLink } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";

export default function Sidebar() {
  const { data: me } = useCurrentUser();

  const profileTo = me?.user?.public_id ? `/user/${me.user.public_id}` : "/";

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
            to={profileTo}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Profile
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
