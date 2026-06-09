import { NavLink } from "react-router-dom";
import { Clock, User } from "lucide-react";

export default function BottomTabBar() {
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
