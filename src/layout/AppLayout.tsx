import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import ScoutTray from "../agents/ScoutTray";
import { useCurrentUser } from "../hooks/useCurrentUser";

export default function AppLayout() {
  const [scoutOpen, setScoutOpen] = useState(false);
  const { data: me } = useCurrentUser();

  const visibleModules = (me?.modules ?? []).filter(
    (m) => me?.is_admin || m.can_read,
  );

  return (
    <div className="app-layout">
      <Sidebar modules={visibleModules} />
      <div className="app-main">
        <Header
          scoutOpen={scoutOpen}
          onToggleScout={() => setScoutOpen((o) => !o)}
        />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      <ScoutTray open={scoutOpen} onClose={() => setScoutOpen(false)} />
    </div>
  );
}
