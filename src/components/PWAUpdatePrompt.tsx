import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

/**
 * Registers the production service worker and surfaces its lifecycle to
 * the user. Phase 1.4 — wiring only; the visible toast lands in Phase 1.5.
 *
 * registerType is 'prompt' (vite.config.ts) so a new SW activates only when
 * the user clicks Reload — never silently. This protects installed clients
 * from a borked deploy. `/sw-kill.html` is the manual recovery path.
 */
export default function PWAUpdatePrompt() {
  const [, setNeedRefresh] = useState(false);
  const [, setOfflineReady] = useState(false);
  const [, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // registerSW returns an updater fn we can call with (true) to apply a
    // queued update. We stash it in state so the toast UI in Phase 1.5 can
    // invoke it from the Reload button.
    const updater = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
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
    setUpdateSW(() => updater);
  }, []);

  // Phase 1.4 renders nothing. The toast UI lands in Phase 1.5; this stub
  // exists so the SW is registered as soon as the React tree mounts.
  return null;
}
