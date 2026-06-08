import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/Toast";
import ProtectedRoute from "./auth/ProtectedRoute";
import LoginPage from "./auth/LoginPage";
import AppLayout from "./layout/AppLayout";

import UserProfile from "./pages/users/UserProfile";

import TimeEntryList from "./pages/time-entry/TimeEntryList";
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

                <Route path="/time-entry/list" element={<TimeEntryList />} />
                <Route path="/time-entry/create" element={<TimeEntryCreate />} />
                <Route path="/time-entry/:id" element={<TimeEntryView />} />

                <Route path="/user/:id" element={<UserProfile />} />
                <Route path="/user/:id/edit" element={<UserProfile />} />

                <Route path="*" element={<Navigate to="/time-entry/list" replace />} />
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
