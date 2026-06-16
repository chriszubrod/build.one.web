import useOnline from "../hooks/useOnline";
import { WifiOff } from "lucide-react";

/**
 * Hover overlay (not in-flow) shown when the browser reports navigator.onLine
 * === false. Lives at the top of the viewport, doesn't push page content
 * downward, slides in/out on connectivity transitions.
 *
 * Phase 1 (PWA Shell) treats this as a signal-only affordance — actions
 * are not disabled. Phase 1.7 wires per-mutation "Not saved — you are
 * offline" toasts so writes surface a clean failure rather than a 401.
 */
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <WifiOff size={14} strokeWidth={2.25} />
      <span>You're offline. Some actions are disabled.</span>
    </div>
  );
}
