import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Returns the timestamp (epoch ms) of the most recent successful React
 * Query fetch across the entire cache, or null if no successful fetch
 * has happened yet (e.g. first launch, no network).
 *
 * The hook re-renders every 30s so callers showing relative time
 * ("Synced 2m ago") stay accurate without manual ticking.
 */
export default function useLatestSync(): number | null {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    void tick;
    const all = queryClient.getQueryCache().getAll();
    let max = 0;
    for (const q of all) {
      const t = q.state.dataUpdatedAt;
      if (t && t > max) max = t;
    }
    return max > 0 ? max : null;
  }, [queryClient, tick]);
}

/**
 * Compact relative-time formatter. Stays terse so it fits in the
 * OfflineBanner pill alongside the wifi-off icon.
 */
export function fmtRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
