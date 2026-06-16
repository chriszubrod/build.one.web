import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { useToast } from "./Toast";

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
    const updater = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        toast("Ready to work offline.", "success");
      },
      onRegistered(registration) {
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
    // No cleanup — registration is process-lifetime.
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
