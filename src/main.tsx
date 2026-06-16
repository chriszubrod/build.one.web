import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { get, set, del } from "idb-keyval";
import "./index.css";
import App from "./App";
import { getUserPublicIdFromStorage } from "./api/jwt";

/**
 * PWA Tier 2 — persistent React Query cache.
 *
 * The cache is keyed PER USER (uid claim from the JWT). At boot, we read
 * the access_token from localStorage, decode it, and derive the user's
 * public_id; the persister stores everything under
 * `bo.rq.v1.<user_public_id>` in IndexedDB.
 *
 * Why per-user keying is mandatory: a shared device (field iPad) where
 * user A signs out and user B signs in must NEVER see user A's cached
 * data. The iOS app shipped a multi-user state-bleed bug in v0.1.0
 * because logout wasn't fully scoping cleanup; same risk applies here.
 *
 * Boot-time keying means login and logout both want to force a reload
 * so the new key takes effect. AuthContext.logout already does
 * window.location.href = '/login'; LoginPage navigates via reload
 * after successful login (see Phase 2.4 follow-up below).
 *
 * Unauthenticated boots get the placeholder key `bo.rq.v1.guest` so the
 * shape is consistent; that key holds at most a few /lookups-style
 * responses and is cleared on logout alongside the user key.
 */
const userPublicId = getUserPublicIdFromStorage();
const PERSISTER_STORAGE_KEY = `bo.rq.v1.${userPublicId ?? "guest"}`;

const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value).then(() => undefined),
    removeItem: (key) => del(key).then(() => undefined),
  },
  key: PERSISTER_STORAGE_KEY,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      // gcTime must be ≥ maxAge for persistence to be useful — queries
      // need to survive in-memory long enough to be re-hydrated from
      // disk. 24h matches the Tier 2 spec; the persister maxAge below
      // bounds the on-disk lifetime independently.
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      // 'offlineFirst' means cached data is returned even if the network
      // fetch fails — the right semantic for Tier 2 reads.
      networkMode: "offlineFirst",
      retry: 1,
    },
  },
});

// Buster bumps invalidate the entire persisted cache when the app's
// data shape changes (e.g. a TypeScript model gains a required field).
// Bump this string whenever an entity-model migration would break
// deserialization of an older cached payload.
const PERSISTER_BUSTER = "bo-rq-v1";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        buster: PERSISTER_BUSTER,
      }}
    >
      <App />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </PersistQueryClientProvider>
  </StrictMode>,
);
