import { Outlet } from "react-router-dom";
import BudgetSidebar from "./BudgetSidebar";
import Header from "./Header";
import "../pages/budgets/budget.css";

/**
 * Desktop layout for /budget/* — revives the surviving .app-layout chrome
 * (sidebar + header + scrolling content) instead of the 430px phone shell.
 * Sibling to AppLayout under ProtectedRoute. Locked design decision
 * (2026-06-11): budgets are an office/desktop surface; field workers never
 * receive the Budgets module grant, so they never reach here.
 */
export default function BudgetLayout() {
  return (
    <div className="app-layout">
      <BudgetSidebar />
      <div className="app-main">
        <Header />
        <main className="app-content" id="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
