import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import useOnline from "../hooks/useOnline";
import { ITEM_KEY_PREFIX } from "../persistPolicy";

/**
 * Refetches cached React Query data on the offline → online transition.
 *
 * `refetchOnReconnect` (React Query's default: true) is what fires on a
 * connectivity change during a stable mount — `refetchOnMount` is the one
 * that fires on mount. This sweep is a second, explicit invalidation of
 * list/lookup/identity queries so a user who stayed on a list sees fresh
 * rows after a Wi-Fi blip, not only the queries that happened to be stale
 * past `staleTime`.
 *
 * The predicate skips single-entity queries (`ITEM_KEY_PREFIX`). That is a
 * reduction in pointless token churn, not a lost-update fix: an open
 * detail page still refetches on reconnect via React Query itself
 * (`refetchOnReconnect` default true, and `networkMode: "offlineFirst"`
 * resumes a paused retryer even when that default is flipped off). The
 * lost-update hole is closed by the divergence gate in U-471
 * (`useServerOwnedRebase` / `serverDiverged`), which refuses to copy a
 * fresh write token onto a form whose editable body no longer matches the
 * last-in-sync baseline, no matter how the fresh record arrived.
 *
 * Renders nothing; mount once in App.tsx.
 */
export default function InvalidateOnReconnect() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const wasOffline = useRef(!online);

  useEffect(() => {
    if (wasOffline.current && online) {
      // Cached payloads stay visible during refetch (React Query's default
      // placeholder behavior under staleTime).
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== ITEM_KEY_PREFIX,
      });
    }
    wasOffline.current = !online;
  }, [online, queryClient]);

  return null;
}
