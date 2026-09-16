import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InvalidateOnReconnect from "./InvalidateOnReconnect";
import { entityItemKey, entityListKey } from "../hooks/useEntity";
import { ITEM_KEY_PREFIX } from "../persistPolicy";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * U-471 — the reconnect sweep skips single-entity queries.
 *
 * That is a reduction in pointless token churn, not a lost-update fix.
 * React Query's `refetchOnReconnect` default is `true` and fires on a
 * connectivity change during a stable mount (`refetchOnMount` is the one
 * that fires on mount). An open detail page still refetches on reconnect
 * via React Query itself; the divergence gate in `useServerOwnedRebase`
 * is what closes the lost-update hole. These specs drive a real
 * QueryClient — including an `offline` then `online` transition so
 * `onlineManager` actually moves — and assert `isInvalidated` on
 * registered keys. A call-shape assertion would stay green with the
 * predicate inverted.
 */

const LIST_KEY = entityListKey("/api/v1/get/bills");
const ITEM_KEY = entityItemKey("/api/v1/get/bill/bill-1");
const LOOKUPS_KEY = ["lookups", "vendors"] as const;
const ME_KEY = ["me"] as const;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

function seedCache() {
  queryClient.setQueryData(LIST_KEY, [{ id: 1 }]);
  queryClient.setQueryData(ITEM_KEY, { public_id: "bill-1", row_version: "v1" });
  queryClient.setQueryData(LOOKUPS_KEY, { vendors: [] });
  queryClient.setQueryData(ME_KEY, { user_id: 1 });
}

function renderSubject() {
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(InvalidateOnReconnect),
      ),
    );
  });
}

function goOnline() {
  setNavigatorOnline(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

function goOffline() {
  setNavigatorOnline(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

/** Mount online, then a real offline → online blip (both window events). */
function reconnectFromOffline() {
  setNavigatorOnline(true);
  onlineManager.setOnline(true);
  seedCache();
  renderSubject();
  // Hard precondition: a vacuous pass would look like "already invalidated".
  expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(ITEM_KEY)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(LOOKUPS_KEY)?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(ME_KEY)?.isInvalidated).toBe(false);
  goOffline();
  goOnline();
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        networkMode: "offlineFirst",
        retry: 1,
        // refetchOnReconnect is intentionally UNSET — production does not
        // set it, so React Query's default (true) applies. Disabling it
        // here would hide the exact mechanism that causes the P0.
      },
    },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setNavigatorOnline(true);
  onlineManager.setOnline(true);
});

describe("InvalidateOnReconnect — skip item queries", () => {
  it("invalidates a list query on offline → online", () => {
    reconnectFromOffline();
    expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(true);
  });

  it("does not invalidate an item query on offline → online", () => {
    reconnectFromOffline();
    expect(ITEM_KEY[0]).toBe(ITEM_KEY_PREFIX);
    expect(queryClient.getQueryState(ITEM_KEY)?.isInvalidated).toBe(false);
  });

  it("invalidates lookups and me on offline → online", () => {
    reconnectFromOffline();
    expect(queryClient.getQueryState(LOOKUPS_KEY)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(ME_KEY)?.isInvalidated).toBe(true);
  });

  it("does not invalidate on online → offline, or on a re-render with no connectivity change", () => {
    setNavigatorOnline(true);
    onlineManager.setOnline(true);
    seedCache();
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    renderSubject();
    renderSubject();
    expect(spy).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(ITEM_KEY)?.isInvalidated).toBe(false);

    goOffline();
    expect(spy).not.toHaveBeenCalled();
    expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(ITEM_KEY)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(LOOKUPS_KEY)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(ME_KEY)?.isInvalidated).toBe(false);
  });
});
