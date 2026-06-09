import { Outlet } from "react-router-dom";
import BottomTabBar from "./BottomTabBar";

export default function AppLayout() {
  return (
    <div className="app-shell">
      <main className="app-shell-content">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  );
}
