import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import SectionCard from "./ui/SectionCard";

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught render error:", error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="ios-page">
          <SectionCard header="Something went wrong">
            <p style={{ margin: 0, color: "var(--color-text-secondary, var(--color-text))" }}>
              This page hit an unexpected error. Your work elsewhere is safe — reload to try again.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: "var(--space-lg)" }}
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </SectionCard>
        </div>
      );
    }
    return this.props.children;
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>;
}
