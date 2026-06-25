import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rawRequest, post } from "../api/client";
import { subscribeToProfileEvents } from "./profileEventsClient";
import { clearAllUserScopedStorage } from "./cacheCleanup";
import type { AuthResponse } from "../types/api";

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  /**
   * Sign in and hard-reload to `redirectTo` (default `/`). Callers MUST
   * pre-validate `redirectTo` via `safeRedirect()` — this function does
   * not re-validate. A bare relative path is required; passing an
   * absolute URL would let the browser navigate cross-origin.
   */
  login: (username: string, password: string, redirectTo?: string) => Promise<void>;
  signup: (
    username: string,
    password: string,
    confirmPassword: string,
    registrationCode: string,
  ) => Promise<void>;
  /** Awaited so callers can ensure cache cleanup before redirect. */
  logout: () => Promise<void>;
  /**
   * Sign out of ALL active sessions for this user across every device.
   * Calls the server-side revoke-all-refresh-tokens endpoint, then runs
   * the local logout cleanup. Best-effort on the server call — local
   * logout proceeds even if the server is unreachable so the user isn't
   * stranded on a "wanted to sign out" intent.
   */
  signOutAllDevices: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem("username");
  });
  const queryClient = useQueryClient();

  const isAuthenticated = !!localStorage.getItem("access_token");

  const login = useCallback(async (user: string, password: string, redirectTo: string = "/") => {
    // Clear any prior user's persisted cache BEFORE writing the new token,
    // so the next-boot persister key resolution doesn't briefly see the
    // outgoing identity. (Belt-and-suspenders alongside the boot-time
    // user-scoped keying in main.tsx.)
    await clearAllUserScopedStorage();
    queryClient.clear();

    const res = await rawRequest<{ data: AuthResponse }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: user, password }),
    });

    const { auth, token } = res.data;
    localStorage.setItem("access_token", token.access_token);
    localStorage.setItem("username", auth.username);
    setUsername(auth.username);

    // Hard reload so the boot-time persister keying picks up the new
    // user's public_id. Without this, queries persist under the boot's
    // "guest" key and any subsequent login-as-other on the same tab
    // would reuse that key.
    //
    // `redirectTo` MUST be a same-origin path validated by `safeRedirect()`
    // upstream. Setting `window.location.href` to an absolute URL would
    // navigate cross-origin — the whole point of safeRedirect is to ensure
    // that can't happen.
    window.location.href = redirectTo;
  }, [queryClient]);

  const signup = useCallback(
    async (
      user: string,
      password: string,
      confirmPassword: string,
      registrationCode: string,
    ) => {
      const res = await rawRequest<{ data: AuthResponse }>(
        "/api/v1/signup/auth",
        {
          method: "POST",
          body: JSON.stringify({
            username: user,
            password,
            confirm_password: confirmPassword,
            registration_code: registrationCode,
          }),
        },
      );
      const { auth, token } = res.data;
      localStorage.setItem("access_token", token.access_token);
      localStorage.setItem("username", auth.username);
      setUsername(auth.username);

      // Hard reload so the boot-time persister keying picks up the new
      // user's public_id (mirror of login()).
      window.location.href = "/";
    },
    [],
  );

  /**
   * Logout — clears EVERY per-user storage surface before navigating to
   * /login. Awaiting the cleanup is the contract that prevents the iOS
   * v0.1.0-class multi-user state-bleed bug from shipping to web. Order:
   *   1. clear IndexedDB persister keys (current user + guest)
   *   2. clear SW runtime caches (NetworkFirst API reads)
   *   3. clear React Query in-memory
   *   4. clear localStorage auth identifiers
   *   5. hard reload to /login
   *
   * Returns a Promise that resolves when the redirect has been issued so
   * any caller (logout button, session-expiry handler) can `await` it.
   */
  const logout = useCallback(async () => {
    try {
      await clearAllUserScopedStorage();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[logout] cleanup failed (continuing anyway):", err);
    }
    queryClient.clear();
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    setUsername(null);
    window.location.href = "/login";
  }, [queryClient]);

  /**
   * Sign out across every device for this user. Calls the API to
   * revoke every active refresh-token row for the current Auth record,
   * then runs the standard local logout (cleanup + redirect to /login).
   *
   * The server call is best-effort — a network failure or 5xx still
   * proceeds with local logout so the user isn't trapped. Other devices
   * will fail closed on their next refresh attempt (their refresh token
   * row is gone) and bounce to /login.
   */
  const signOutAllDevices = useCallback(async () => {
    try {
      await post(`/api/v1/mobile/auth/logout-all-devices`, {});
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[signOutAllDevices] server-side revocation failed (still doing local logout):",
        err,
      );
    }
    await logout();
  }, [logout]);

  // Subscribe to profile-change events while authenticated. The server emits
  // `profile_changed` when an admin mutates the caller's UserRole or the
  // RoleModules under their role. We respond by invalidating ['me'] so the
  // Sidebar + anything else reading the profile refetches fresh data.
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsubscribe = subscribeToProfileEvents(
      (event) => {
        if (event.event === "profile_changed") {
          queryClient.invalidateQueries({ queryKey: ["me"] });
        }
      },
    );
    return unsubscribe;
  }, [isAuthenticated, queryClient]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, signup, logout, signOutAllDevices }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
