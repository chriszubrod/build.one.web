import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import useOnline from "../hooks/useOnline";

/**
 * Forces every React Query query to re-fetch on the offline → online
 * transition. Without this the user could sit on stale cached data after
 * reconnecting; React Query's `refetchOnReconnect` default fires on
 * mount, not on connectivity changes that happen during a stable mount.
 *
 * Renders nothing; mount once in App.tsx.
 */
export default function InvalidateOnReconnect() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const wasOffline = useRef(!online);

  useEffect(() => {
    if (wasOffline.current && online) {
      // Came back online — invalidate everything so views show fresh data.
      // Cached payloads stay visible during refetch (React Query's default
      // placeholder behavior under staleTime).
      queryClient.invalidateQueries();
    }
    wasOffline.current = !online;
  }, [online, queryClient]);

  return null;
}
