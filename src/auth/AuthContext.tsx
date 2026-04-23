import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rawRequest } from "../api/client";
import { subscribeToProfileEvents } from "./profileEventsClient";
import type { AuthResponse } from "../types/api";

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem("username");
  });
  const queryClient = useQueryClient();

  const isAuthenticated = !!localStorage.getItem("access_token");

  const login = useCallback(async (user: string, password: string) => {
    const res = await rawRequest<{ data: AuthResponse }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: user, password }),
    });

    const { auth, token } = res.data;
    localStorage.setItem("access_token", token.access_token);
    localStorage.setItem("username", auth.username);
    setUsername(auth.username);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    setUsername(null);
    queryClient.removeQueries({ queryKey: ["me"] });
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
    <AuthContext.Provider value={{ isAuthenticated, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
