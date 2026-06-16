import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/Toast";
import ToastBridge from "./components/ToastBridge";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import OfflineBanner from "./components/OfflineBanner";
import ProtectedRoute from "./auth/ProtectedRoute";
import LoginPage from "./auth/LoginPage";
import AppLayout from "./layout/AppLayout";

import ProfileView from "./pages/profile/ProfileView";
import UserDetailScreen from "./pages/profile/UserDetailScreen";
import TextFieldEditScreen from "./pages/profile/TextFieldEditScreen";
import SecurityScreen from "./pages/profile/SecurityScreen";
import AppearanceScreen from "./pages/profile/AppearanceScreen";

import LaborList from "./pages/labor/LaborList";
import LaborReviewScreen from "./pages/labor/LaborReviewScreen";
import TodayScreen from "./pages/time-entry/TodayScreen";
import PastDayScreen from "./pages/time-entry/PastDayScreen";
import EditEntryScreen from "./pages/time-entry/EditEntryScreen";
import CreateLogScreen from "./pages/time-entry/CreateLogScreen";
import TimeEntryView from "./pages/time-entry/TimeEntryView";
import TimeEntryCreate from "./pages/time-entry/TimeEntryCreate";

// Budget surface (Phase 3) — desktop layout, office/PM audience (gated on
// the Budgets module). Sibling to the phone AppLayout under ProtectedRoute.
import BudgetLayout from "./layout/BudgetLayout";
import BudgetList from "./pages/budgets/BudgetList";
import BudgetCreate from "./pages/budgets/BudgetCreate";
import BudgetView from "./pages/budgets/BudgetView";
import BudgetEdit from "./pages/budgets/BudgetEdit";

// Parked for v0.1.0 — Option B trim (excluded via tsconfig.app.json,
// not bundled by Vite since unreachable from this route tree). Restore
// pages by re-adding their imports + routes here when ready.

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ToastBridge />
          <PWAUpdatePrompt />
          <OfflineBanner />
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/time-entry/list" replace />} />

                <Route path="/time-entry/list" element={<TodayScreen />} />
                <Route path="/time-entry/past/:date" element={<PastDayScreen />} />
                <Route path="/time-entry/create" element={<TimeEntryCreate />} />
                <Route path="/time-entry/log/new" element={<CreateLogScreen />} />
                <Route path="/time-entry/:entryPublicId/log/:logPublicId" element={<EditEntryScreen />} />
                <Route path="/time-entry/:id" element={<TimeEntryView />} />

                <Route path="/labor/list" element={<LaborList />} />
                <Route path="/labor/:public_id" element={<LaborReviewScreen />} />

                <Route path="/profile" element={<ProfileView />} />
                <Route path="/profile/details" element={<UserDetailScreen />} />
                <Route path="/profile/details/:fieldKey" element={<TextFieldEditScreen />} />
                <Route path="/profile/security" element={<SecurityScreen />} />
                <Route path="/profile/appearance" element={<AppearanceScreen />} />

                <Route path="/user/:id" element={<Navigate to="/profile" replace />} />
                <Route path="/user/:id/edit" element={<Navigate to="/profile" replace />} />

                <Route path="*" element={<Navigate to="/time-entry/list" replace />} />
              </Route>

              {/* Budget surface — desktop chrome, separate from the phone shell.
                  Static /budget/* paths outrank AppLayout's "*" splat. */}
              <Route element={<BudgetLayout />}>
                <Route path="/budget/list" element={<BudgetList />} />
                <Route path="/budget/create" element={<BudgetCreate />} />
                <Route path="/budget/:publicId" element={<BudgetView />} />
                <Route path="/budget/:publicId/edit" element={<BudgetEdit />} />
                <Route path="/budget/*" element={<Navigate to="/budget/list" replace />} />
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
