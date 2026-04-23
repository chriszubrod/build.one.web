import { useQuery } from "@tanstack/react-query";
import { getOne } from "../api/client";
import type { CurrentUser } from "../types/api";

/**
 * Current-user profile with role + per-module permissions.
 *
 * Cached under ['me']. Invalidated by the SSE subscriber in AuthContext
 * on `profile_changed`, by `refetchOnWindowFocus` on tab return, or by
 * explicit mutations.
 */
export function useCurrentUser(options?: { enabled?: boolean }) {
  return useQuery<CurrentUser>({
    queryKey: ["me"],
    queryFn: () => getOne<CurrentUser>("/api/v1/auth/me"),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled ?? true,
  });
}
