/**
 * U-471 — the spec whose absence let the P0 ship.
 *
 * A previous attempt filtered `['item', …]` out of InvalidateOnReconnect.
 * Adversarial review proved that insufficient, with runnable probes:
 *   - `refetchOnReconnect` is not set anywhere in `src/`. React Query's
 *     default is `true`, so any item query stale past `staleTime` (5 min)
 *     refetches on reconnect regardless of any invalidation filter.
 *   - `networkMode: "offlineFirst"` means an offline GET is attempted,
 *     fails, and PAUSES; reconnect resumes the paused retryer and fresh
 *     data lands. Not even `refetchOnReconnect: false` closes that path.
 *
 * These specs drive a REAL `useEntityItem` observer with production-faithful
 * QueryClient defaults, dispatch `offline` then `online`, and assert the
 * POST-FIX property: after such a reconnect, when a co-editor changed an
 * editable field, the form's `row_version` does NOT move and `diverged` is
 * true; when only owned fields moved, the token DOES rebase.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InvalidateOnReconnect from "../components/InvalidateOnReconnect";
import { useEntityItem } from "./useEntity";
import { useServerOwnedRebase } from "./useServerOwnedRebase";

const h = vi.hoisted(() => ({
  calls: 0,
  version: "v1",
  memo: "server memo",
  is_draft: true,
  failWhenOffline: false,
}));

vi.mock("../api/client", () => {
  class ApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  }
  return {
    ApiError,
    getOne: async () => {
      h.calls += 1;
      if (h.failWhenOffline && !navigator.onLine) throw new Error("offline");
      return {
        public_id: "bill-1",
        row_version: h.version,
        memo: h.memo,
        is_draft: h.is_draft,
      };
    },
    getList: async () => ({ data: [], count: 0 }),
    post: async () => ({}),
    put: async () => ({}),
    del: async () => ({}),
  };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEM_PATH = "/api/v1/get/bill/bill-1";

interface Bill {
  public_id: string;
  row_version: string;
  memo: string;
  is_draft: boolean;
}

function seedFrom(b: Bill) {
  return {
    memo: b.memo ?? "",
    is_draft: b.is_draft,
    row_version: b.row_version,
  };
}

let seen: { form: Record<string, unknown> | null; diverged: boolean } = {
  form: null,
  diverged: false,
};

function MiniEdit() {
  const { item } = useEntityItem<Bill>(ITEM_PATH);
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const seededFor = useRef<string | null>(null);
  const { diverged, acceptBaseline } = useServerOwnedRebase({
    item,
    seededFor,
    setForm,
    seedFrom,
    owned: ["row_version", "is_draft"],
  });
  if (item && !form) {
    seededFor.current = item.public_id;
    acceptBaseline(item);
    setForm(seedFrom(item));
  }
  seen = { form, diverged };
  return null;
}

let container: HTMLDivElement;
let root: Root;

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

async function flush(ms = 0) {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, ms));
    await Promise.resolve();
  });
}

function productionQueryClient(overrides: Record<string, unknown> = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        networkMode: "offlineFirst",
        retry: 1,
        ...overrides,
      },
    },
  });
}

function mount(client: QueryClient) {
  return act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(InvalidateOnReconnect),
        createElement(MiniEdit),
      ),
    );
  });
}

async function blipPastStaleTime() {
  const realNow = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => realNow + 6 * 60 * 1000);
  await act(async () => {
    window.dispatchEvent(new Event("offline"));
  });
  setNavigatorOnline(true);
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  await flush();
}

beforeEach(() => {
  h.calls = 0;
  h.version = "v1";
  h.memo = "server memo";
  h.is_draft = true;
  h.failWhenOffline = false;
  seen = { form: null, diverged: false };
  setNavigatorOnline(true);
  onlineManager.setOnline(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  setNavigatorOnline(true);
  onlineManager.setOnline(true);
});

describe("useServerOwnedRebase — reconnect is not a token rebase", () => {
  it("does NOT rebase the token when a co-editor changed an editable field", async () => {
    const client = productionQueryClient();
    await mount(client);
    await flush();

    expect(h.calls).toBe(1);
    expect(seen.form?.row_version).toBe("v1");
    expect(seen.diverged).toBe(false);

    h.version = "v2";
    h.memo = "co-editor memo";
    await blipPastStaleTime();

    expect(h.calls).toBe(2);
    expect(seen.form?.row_version).toBe("v1");
    expect(seen.form?.memo).toBe("server memo");
    expect(seen.diverged).toBe(true);
  });

  it("DOES rebase the token when only owned fields moved", async () => {
    const client = productionQueryClient();
    await mount(client);
    await flush();
    expect(seen.form?.row_version).toBe("v1");

    h.version = "v2";
    h.is_draft = false;
    await blipPastStaleTime();

    expect(h.calls).toBe(2);
    expect(seen.form?.row_version).toBe("v2");
    expect(seen.form?.is_draft).toBe(false);
    expect(seen.form?.memo).toBe("server memo");
    expect(seen.diverged).toBe(false);
  });

  it("paused retryer: co-editor edit does not rebase the token", async () => {
    const client = productionQueryClient({ retryDelay: 0, refetchOnReconnect: false });
    await mount(client);
    await flush();
    expect(seen.form?.row_version).toBe("v1");

    h.failWhenOffline = true;
    h.version = "v2";
    h.memo = "co-editor memo";

    setNavigatorOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    await act(async () => {
      client.invalidateQueries({ queryKey: ["item", ITEM_PATH] });
    });
    await flush(10);
    expect(seen.form?.row_version).toBe("v1");

    setNavigatorOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await flush(10);

    expect(seen.form?.row_version).toBe("v1");
    expect(seen.form?.memo).toBe("server memo");
    expect(seen.diverged).toBe(true);
  });

  it("paused retryer: owned-only change DOES rebase the token", async () => {
    const client = productionQueryClient({ retryDelay: 0, refetchOnReconnect: false });
    await mount(client);
    await flush();

    h.failWhenOffline = true;
    h.version = "v2";
    h.is_draft = false;

    setNavigatorOnline(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    await act(async () => {
      client.invalidateQueries({ queryKey: ["item", ITEM_PATH] });
    });
    await flush(10);

    setNavigatorOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await flush(10);

    expect(seen.form?.row_version).toBe("v2");
    expect(seen.form?.is_draft).toBe(false);
    expect(seen.diverged).toBe(false);
  });
});
