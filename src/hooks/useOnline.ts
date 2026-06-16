import { useEffect, useState } from "react";

/**
 * Reactive wrapper around `navigator.onLine`. Subscribes to the window
 * 'online' and 'offline' events; returns a boolean that re-renders the
 * caller when connectivity transitions.
 *
 * Caveat: navigator.onLine reflects whether the OS has a default route,
 * not whether app.bld-one.com is actually reachable. Captive portals,
 * server outages, and VPN drops can leave the browser thinking it's
 * online when our API is unreachable. PWA Tier 1 treats this as
 * "good enough" — Tier 2 will add an API heartbeat for true reachability.
 */
export default function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
