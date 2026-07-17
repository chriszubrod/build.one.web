import { BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ToastProvider } from "./components/Toast";
import ToastBridge from "./components/ToastBridge";
import PWAUpdatePrompt from "./components/PWAUpdatePrompt";
import OfflineBanner from "./components/OfflineBanner";
import InvalidateOnReconnect from "./components/InvalidateOnReconnect";
import ErrorBoundary from "./components/ErrorBoundary";
import { appRouteTree } from "./routes";

export default function App() {
  return (
    // Outermost backstop: the page-level RouteErrorBoundary in each layout
    // shell is primary (React fires the nearest boundary first, so a page
    // crash keeps the chrome). This catches only what those structurally
    // can't reach — a render error in LoginPage (outside every layout) or in
    // the top-level providers — so no crash can blank the whole React root.
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <ToastBridge />
            <PWAUpdatePrompt />
            <OfflineBanner />
            <InvalidateOnReconnect />
            <Routes>{appRouteTree}</Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
