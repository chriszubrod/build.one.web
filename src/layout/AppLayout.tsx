import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { rawRequest } from "../api/client";
import type { LookupModule } from "../types/api";

export default function AppLayout() {
  const [modules, setModules] = useState<LookupModule[]>([]);

  useEffect(() => {
    rawRequest<{ data: { modules: LookupModule[] } }>("/api/v1/lookups?include=modules")
      .then((res) => setModules(res.data.modules ?? []))
      .catch(() => setModules([]));
  }, []);

  return (
    <div className="app-layout">
      <Sidebar modules={modules} />
      <div className="app-main">
        <Header />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
