import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { useToast } from "./Toast";

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
export const FOCUS_CHECK_MIN_GAP_MS = 5 * 60 * 1000;

/** Minimal surface needed for periodic `registration.update()` checks. */
export type SwRegistrationLike = Pick<ServiceWorkerRegistration, "update" | "installing">;

/**
 * Schedules background SW update checks: on a fixed interval and when the tab
 * becomes visible (throttled). Returns `stop()` — call on unmount or before
 * restarting so only one schedule is alive.
 */
export function startUpdateChecks(registration: SwRegistrationLike): () => void {
  let lastCheckAt = -Infinity;
  let checkInFlight = false;

  async function runCheck() {
    if (!navigator.onLine) return;
    if (checkInFlight) return;
    if (registration.installing) return;

    checkInFlight = true;
    lastCheckAt = Date.now();
    try {
      await registration.update();
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[PWA] Service worker update check failed.", err);
      }
    } finally {
      checkInFlight = false;
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    const elapsed = Date.now() - lastCheckAt;
    if (elapsed < FOCUS_CHECK_MIN_GAP_MS) return;
    void runCheck();
  }

  const intervalId = setInterval(() => {
    void runCheck();
  }, UPDATE_CHECK_INTERVAL_MS);

  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    clearInterval(intervalId);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

/**
 * Registers the production service worker and surfaces its lifecycle to
 * the user.
 *
 * - onNeedRefresh — new SW is waiting. We show a persistent bottom banner
 *   with a "Reload" button. registerType is 'prompt' (vite.config.ts) so
 *   the user explicitly opts into the update; nothing happens silently.
 * - onOfflineReady — SW finished precaching the shell. We surface a brief
 *   toast so the user knows the install completed.
 *
 * The escape hatch for a borked SW is /sw-kill.html — see docs/pwa-tier1.md.
 */
export default function PWAUpdatePrompt() {
  const { toast } = useToast();
  const [needRefresh, setNeedRefresh] = useState(false);
  // useRef so the updater can be called without re-rendering when it lands.
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    let active = true;
    let stopUpdateChecks: (() => void) | null = null;

    const updater = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        toast("Ready to work offline.", "success");
      },
      onRegistered(registration) {
        if (!active) return;
        if (registration) {
          stopUpdateChecks?.();
          stopUpdateChecks = startUpdateChecks(registration);
        }
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.info("[PWA] Service worker registered.", registration);
        }
      },
      onRegisterError(error) {
        // eslint-disable-next-line no-console
        console.error("[PWA] Service worker registration failed.", error);
      },
    });
    updateSWRef.current = updater;

    return () => {
      active = false;
      stopUpdateChecks?.();
      stopUpdateChecks = null;
    };
  }, [toast]);

  if (!needRefresh) return null;

  const onReload = () => {
    void updateSWRef.current?.(true);
  };

  const onDismiss = () => {
    setNeedRefresh(false);
  };

  return (
    <div className="pwa-update-banner" role="status" aria-live="polite">
      <span className="pwa-update-banner-text">A new version is available.</span>
      <button
        type="button"
        className="pwa-update-banner-reload"
        onClick={onReload}
      >
        Reload
      </button>
      <button
        type="button"
        className="pwa-update-banner-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss update prompt"
      >
        ×
      </button>
    </div>
  );
}
