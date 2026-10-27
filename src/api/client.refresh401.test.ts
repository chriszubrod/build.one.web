/**
 * U-735 — only log out when refresh fails on 401; a live session that hits a
 * broken/denying endpoint must stay signed in and surface ApiError(401).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/cacheCleanup", () => ({
  clearAllUserScopedStorage: vi.fn().mockResolvedValue(undefined),
}));

import { clearAllUserScopedStorage } from "../auth/cacheCleanup";
import {
  ApiError,
  fetchViewAttachmentBlob,
  getOne,
  post,
  refreshAccessToken,
  uploadFile,
} from "./client";

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installLocationSpy() {
  let href = "http://localhost/";
  const locationMock = {
    get href() {
      return href;
    },
    set href(v: string) {
      href = v;
    },
  };
  vi.spyOn(window, "location", "get").mockReturnValue(locationMock as Location);
  return {
    getHref: () => href,
  };
}

type ApiFetchOptions = {
  retryStatus?: number;
  refreshFails?: boolean;
  retryDetail?: string;
  successBody?: unknown;
};

function installApiFetch(options: ApiFetchOptions = {}) {
  const {
    retryStatus = 200,
    refreshFails = false,
    retryDetail = "Forbidden for this route",
    successBody = { data: { id: 42 } },
  } = options;

  let apiCalls = 0;
  let refreshCalls = 0;

  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/api/v1/auth/refresh")) {
      refreshCalls += 1;
      if (refreshFails) {
        return new Response(JSON.stringify({ detail: "refresh dead" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return okJson({ data: { token: { access_token: "bearer-refreshed" } } });
    }

    apiCalls += 1;
    if (apiCalls === 1) {
      return okJson({ detail: "token expired" }, 401);
    }
    if (retryStatus === 401) {
      return okJson({ detail: retryDetail }, 401);
    }
    if (retryStatus === 200 && url.includes("/view/attachment/")) {
      return new Response(new Blob(["pdf-bytes"]), { status: 200 });
    }
    return okJson(successBody, retryStatus);
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    getApiCalls: () => apiCalls,
    getRefreshCalls: () => refreshCalls,
    fetchMock,
  };
}

beforeEach(() => {
  localStorage.setItem("access_token", "bearer-original");
  localStorage.setItem("username", "chris");
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  vi.mocked(clearAllUserScopedStorage).mockClear();
});

describe("401 handling with token refresh (U-735)", () => {
  it("401 → refresh ok → retry 200 returns data and does not redirect", async () => {
    const loc = installLocationSpy();
    installApiFetch({ retryStatus: 200 });

    const data = await getOne<{ id: number }>("/api/v1/get/thing/1");
    expect(data).toEqual({ id: 42 });
    expect(loc.getHref()).not.toContain("/login");
    expect(clearAllUserScopedStorage).not.toHaveBeenCalled();
    expect(localStorage.getItem("access_token")).toBe("bearer-refreshed");
  });

  it("401 → refresh fails → redirect, storage cleared, token removed", async () => {
    const loc = installLocationSpy();
    installApiFetch({ refreshFails: true });

    await expect(getOne("/api/v1/get/thing/1")).rejects.toMatchObject({
      status: 401,
      detail: "Unauthorized",
    });

    expect(clearAllUserScopedStorage).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("username")).toBeNull();
    expect(loc.getHref()).toBe("/login");
  });

  it("401 → refresh ok → retry 401 throws ApiError, no redirect, token kept", async () => {
    const loc = installLocationSpy();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    installApiFetch({ retryStatus: 401, retryDetail: "Endpoint misconfigured" });

    await expect(post("/api/v1/create/thing", { x: 1 })).rejects.toMatchObject({
      status: 401,
      detail: "Endpoint misconfigured",
    });

    expect(clearAllUserScopedStorage).not.toHaveBeenCalled();
    expect(localStorage.getItem("access_token")).toBe("bearer-refreshed");
    expect(loc.getHref()).not.toContain("/login");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[api] 401 after successful token refresh:"),
    );
    expect(warnSpy.mock.calls[0][0]).toContain("/api/v1/create/thing");
    warnSpy.mockRestore();
  });

  it("uploadFile: 401 → refresh ok → retry 401 throws without redirect", async () => {
    const loc = installLocationSpy();
    installApiFetch({ retryStatus: 401 });

    const file = new File(["bytes"], "doc.pdf", { type: "application/pdf" });
    await expect(uploadFile("/api/v1/upload/thing", file)).rejects.toBeInstanceOf(
      ApiError,
    );

    expect(clearAllUserScopedStorage).not.toHaveBeenCalled();
    expect(localStorage.getItem("access_token")).toBe("bearer-refreshed");
    expect(loc.getHref()).not.toContain("/login");
  });

  it("fetchViewAttachmentBlob: 401 → refresh ok → retry 401 throws without redirect", async () => {
    const loc = installLocationSpy();
    let apiCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/v1/auth/refresh")) {
          return okJson({ data: { token: { access_token: "bearer-refreshed" } } });
        }
        apiCalls += 1;
        if (apiCalls === 1) return okJson({ detail: "expired" }, 401);
        return new Response("", { status: 401 });
      }),
    );

    await expect(fetchViewAttachmentBlob("pub-123")).rejects.toMatchObject({
      status: 401,
      detail: "You are not allowed to do that right now.",
    });

    expect(clearAllUserScopedStorage).not.toHaveBeenCalled();
    expect(localStorage.getItem("access_token")).toBe("bearer-refreshed");
    expect(loc.getHref()).not.toContain("/login");
  });

  it("concurrent 401 burst coalesces into a single refresh", async () => {
    installLocationSpy();
    let apiCalls = 0;
    let refreshCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/v1/auth/refresh")) {
          refreshCalls += 1;
          return okJson({ data: { token: { access_token: "bearer-refreshed" } } });
        }
        apiCalls += 1;
        if (apiCalls <= 3) {
          return okJson({ detail: "expired" }, 401);
        }
        return okJson({ data: { id: apiCalls } });
      }),
    );

    const results = await Promise.all([
      getOne<{ id: number }>("/api/v1/get/a"),
      getOne<{ id: number }>("/api/v1/get/b"),
      getOne<{ id: number }>("/api/v1/get/c"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(3);
    expect(clearAllUserScopedStorage).not.toHaveBeenCalled();
  });

  it("refreshAccessToken coalescing unchanged under parallel callers", async () => {
    let refreshCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/v1/auth/refresh")) {
          refreshCalls += 1;
          await new Promise((r) => setTimeout(r, 5));
          return okJson({ data: { token: { access_token: "t-new" } } });
        }
        return okJson({ data: {} });
      }),
    );

    await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(refreshCalls).toBe(1);
  });
});

describe("U-735 credential endpoints", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wrong password on login: no refresh, no redirect, ApiError with the server detail", async () => {
    const loc = installLocationSpy();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/auth/refresh")) {
        return okJson({ data: { access_token: "should-not-be-used" } });
      }
      return okJson({ detail: "Invalid username or password." }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(post("/api/v1/auth/login", { username: "u", password: "p" })).rejects.toMatchObject({
      status: 401,
      detail: "Invalid username or password.",
    });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/auth/refresh"))).toBe(false);
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(loc.getHref()).toBe("http://localhost/");
    expect(clearAllUserScopedStorage).not.toHaveBeenCalled();
  });
});
