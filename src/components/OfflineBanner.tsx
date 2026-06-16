import useOnline from "../hooks/useOnline";
import useLatestSync, { fmtRelativeTime } from "../hooks/useLatestSync";
import { WifiOff } from "lucide-react";

/**
 * Hover overlay (not in-flow) shown when the browser reports navigator.onLine
 * === false. Lives at the top of the viewport, doesn't push page content
 * downward, slides in/out on connectivity transitions.
 *
 * Tier 2 addition (Phase 2.7): the banner now includes a "Synced X ago"
 * relative timestamp drawn from the latest React Query dataUpdatedAt
 * across the cache, so the user knows how stale the data they're
 * looking at could be. Updates every 30s.
 *
 * Tier 1 already wires per-mutation "Not saved — you are offline" toasts
 * (src/api/client.ts) so writes surface a clean failure rather than a
 * 401 redirect. Mutation CTAs intentionally stay enabled — the toast
 * is the failure surface, not a disabled button.
 */
export default function OfflineBanner() {
  const online = useOnline();
  const lastSync = useLatestSync();

  if (online) return null;

  const syncHint = lastSync
    ? `Synced ${fmtRelativeTime(lastSync)}`
    : "No data cached yet";

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <WifiOff size={14} strokeWidth={2.25} />
      <span>You're offline · {syncHint}</span>
    </div>
  );
}
