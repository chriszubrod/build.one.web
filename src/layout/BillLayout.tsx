import { Outlet } from "react-router-dom";
import BillSidebar from "./BillSidebar";
import Header from "./Header";

/**
 * Desktop layout for /bill/* — AP completion workflow lives in office chrome,
 * not the 430px phone shell. Same shape as BudgetLayout. Field workers never
 * receive the Bills module grant, so they never reach here.
 */
export default function BillLayout() {
  return (
    <div className="app-layout">
      <BillSidebar />
      <div className="app-main">
        <Header />
        <main className="app-content" id="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
