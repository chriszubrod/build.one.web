/// <reference lib="webworker" />
/**
 * Custom service worker source for Build One.
 *
 * PWA Tier 2 — switches from vite-plugin-pwa's declarative generateSW
 * mode to injectManifest so we can write surgical caching strategies per
 * URL pattern. Tier 2 runtime caching (NetworkFirst for read endpoints,
 * NetworkOnly for everything else) lands in src/sw.ts Phase 2.3.
 *
 * For now (Phase 2.2) the behavior is parity with the prior generateSW
 * configuration — precache the app shell, SKIP_WAITING on message,
 * navigation fallback with the same denylist. No API caching yet.
 */
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

// Allow the page's "Reload" button (PWAUpdatePrompt) to message us. When
// it does, take over from the previous SW and the page reload picks up
// the new build. The `registerType: 'prompt'` in vite.config means the
// user explicitly opts in to this — we don't skipWaiting automatically.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// __WB_MANIFEST is replaced at build time by Workbox with the list of
// precache entries (revisioned shell assets).
precacheAndRoute(self.__WB_MANIFEST);

// Drop old precache entries on activate so the cache doesn't grow
// without bound across deploys.
cleanupOutdatedCaches();

// SPA navigation fallback — any in-app route resolves to index.html so
// React Router can take over. The denylist keeps the SW out of API,
// auth, and the kill-switch path.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/\.auth\//, /^\/sw-kill\.html$/],
  }),
);

// ============================================================================
// Tier 2 — runtime caching for read endpoints
// ============================================================================
// Strategy: NetworkFirst with a 3-second timeout. The browser tries the
// network first; if it's slow or unreachable, we fall back to the cached
// response from IndexedDB. Result: same UX as today when online (fresh
// data on every load); useful staleness when offline (last-fetched data
// from disk instead of a fetch error).
//
// What gets cached:
//   - GET /api/v1/get/*           — entity reads (single + by-* lookups)
//   - GET /api/v1/list/*          — paginated list endpoints (future)
//   - GET /api/v1/lookups*        — dropdown data (vendors, projects, etc.)
//   - GET /api/v1/{entity}/by-*   — entity-specific filtered reads
//                                   (e.g. /contract-labor/by-status/pending)
//
// What is explicitly NOT cached (never hits this route):
//   - Mutations (POST/PUT/DELETE/PATCH) — method check filters them out
//   - /api/v1/auth/* — auth endpoints; identity must always go to network
//   - /api/v1/view/attachment/* — binary blobs; would blow IndexedDB quota
//   - /api/v1/complete/* and /submit/* — workflow triggers, not cacheable
//   - /api/v1/admin/* — privileged endpoints; conservatism by default
//
// Cache cap: 200 entries, 7-day TTL, ~50 MB soft budget (browser-enforced).
// On quota error the ExpirationPlugin LRU-evicts the oldest entries.

const API_READ_CACHE = "bo-api-reads-v1";

// Resolve the API origin from the build-time env var. Vite statically
// replaces import.meta.env.VITE_API_BASE_URL with the configured URL
// (see .env). Falls back to same-origin so dev / tests don't crash.
const API_ORIGIN: string = (() => {
  try {
    const raw = (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env
      ?.VITE_API_BASE_URL;
    return raw ? new URL(raw).origin : self.location.origin;
  } catch {
    return self.location.origin;
  }
})();

function isCacheableReadEndpoint(url: URL, method: string): boolean {
  if (method !== "GET") return false;
  if (url.origin !== API_ORIGIN) return false;
  if (!url.pathname.startsWith("/api/v1/")) return false;
  const path = url.pathname;
  return (
    path.startsWith("/api/v1/get/") ||
    path.startsWith("/api/v1/list/") ||
    path.startsWith("/api/v1/lookups") ||
    // Entity-specific filtered reads: /api/v1/{entity}/by-*
    /^\/api\/v1\/[a-z-]+\/by-[a-z-]+/.test(path)
  );
}

registerRoute(
  ({ request, url }) => isCacheableReadEndpoint(url, request.method),
  new NetworkFirst({
    cacheName: API_READ_CACHE,
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        purgeOnQuotaError: true,
      }),
    ],
  }),
);
