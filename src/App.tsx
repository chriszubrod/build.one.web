import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/Toast";
import ProtectedRoute from "./auth/ProtectedRoute";
import LoginPage from "./auth/LoginPage";
import AppLayout from "./layout/AppLayout";

import ProfileView from "./pages/profile/ProfileView";
import UserDetailScreen from "./pages/profile/UserDetailScreen";
import TextFieldEditScreen from "./pages/profile/TextFieldEditScreen";
import SecurityScreen from "./pages/profile/SecurityScreen";
import AppearanceScreen from "./pages/profile/AppearanceScreen";

import TodayScreen from "./pages/time-entry/TodayScreen";
import PastDayScreen from "./pages/time-entry/PastDayScreen";
import TimeEntryView from "./pages/time-entry/TimeEntryView";
import TimeEntryCreate from "./pages/time-entry/TimeEntryCreate";

// Parked for v0.1.0 — Option B trim (excluded via tsconfig.app.json,
// not bundled by Vite since unreachable from this route tree). Restore
// pages by re-adding their imports + routes here when ready.

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/time-entry/list" replace />} />

                <Route path="/time-entry/list" element={<TodayScreen />} />
                <Route path="/time-entry/past/:date" element={<PastDayScreen />} />
                <Route path="/time-entry/create" element={<TimeEntryCreate />} />
                <Route path="/time-entry/:id" element={<TimeEntryView />} />

                <Route path="/profile" element={<ProfileView />} />
                <Route path="/profile/details" element={<UserDetailScreen />} />
                <Route path="/profile/details/:fieldKey" element={<TextFieldEditScreen />} />
                <Route path="/profile/security" element={<SecurityScreen />} />
                <Route path="/profile/appearance" element={<AppearanceScreen />} />

                <Route path="/user/:id" element={<Navigate to="/profile" replace />} />
                <Route path="/user/:id/edit" element={<Navigate to="/profile" replace />} />

                <Route path="*" element={<Navigate to="/time-entry/list" replace />} />
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
