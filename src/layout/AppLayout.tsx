import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import BottomTabBar from "./BottomTabBar";
import RotateOverlay from "./RotateOverlay";

/**
 * Adaptive shell across mobile / tablet / desktop. Single DOM tree;
 * breakpoints in index.css decide which of AppSidebar / BottomTabBar /
 * RotateOverlay is visible.
 *
 * - Mobile portrait (≤480w): phone-shell column capped at 430px, BottomTabBar.
 * - Mobile landscape (height ≤500): RotateOverlay covers everything.
 * - Tablet portrait (481–1024w portrait): same column, capped at 760px.
 * - Tablet landscape (768w+, height >500): capped at 1024px.
 * - Desktop (≥1281w): full-width flex row with AppSidebar; BottomTabBar hidden.
 */
export default function AppLayout() {
  return (
    <>
      <RotateOverlay />
      <div className="app-shell">
        <AppSidebar />
        {/* id="content" makes this element the canonical scroll container
            for pages under AppLayout (matches the convention BillLayout +
            BudgetLayout already use). Pages that save/restore scroll position
            (e.g., TimeEntryList) target it via document.getElementById. */}
        <main id="content" className="app-shell-content">
          <Outlet />
        </main>
        <BottomTabBar />
      </div>
    </>
  );
}
