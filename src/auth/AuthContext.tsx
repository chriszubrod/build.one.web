import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rawRequest } from "../api/client";
import { subscribeToProfileEvents } from "./profileEventsClient";
import { clearAllUserScopedStorage } from "./cacheCleanup";
import type { AuthResponse } from "../types/api";

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  signup: (
    username: string,
    password: string,
    confirmPassword: string,
    registrationCode: string,
  ) => Promise<void>;
  /** Awaited so callers can ensure cache cleanup before redirect. */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem("username");
  });
  const queryClient = useQueryClient();

  const isAuthenticated = !!localStorage.getItem("access_token");

  const login = useCallback(async (user: string, password: string) => {
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
    window.location.href = "/";
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
    <AuthContext.Provider value={{ isAuthenticated, username, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
