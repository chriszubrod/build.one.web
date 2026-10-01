/**
 * Regression — the generic client must send `X-CSRF-Token` on mutations.
 *
 * Found live on 2026-10-01 by the first real use of the U-585 admin console:
 * `POST /api/v1/admin/auth/set-credentials/{id}` 403'd with "CSRF token
 * missing or invalid." The API enforces CSRF on that route whenever the
 * refresh cookie is present (same condition as /auth/refresh and
 * /auth/logout), but only `refreshAccessToken()` ever attached the header —
 * `post()` / `put()` / `del()` / `uploadFile()` never did. The only UI that
 * reached the route had been unrouted since U-066, so the gap was latent
 * until the console shipped.
 *
 * These tests drive the real `request()` path with a stubbed `fetch` and a
 * real jsdom `document.cookie`. Each is built so the right answer and the
 * wrong answer differ: the header is asserted PRESENT with the exact cookie
 * value on mutations and ABSENT on reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { del, fetchWithRefresh, getOne, post, put, rawRequest, refreshAccessToken, uploadFile } from "./client";
import { cancelAgentRun } from "../agents/sseClient";

type FetchCall = { url: string; init: RequestInit };

const calls: FetchCall[] = [];

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headerOf(call: FetchCall, name: string): string | undefined {
  const h = call.init.headers as Record<string, string> | undefined;
  return h?.[name];
}

function setCsrfCookie(value: string | null) {
  // jsdom honours expiry; an expired write deletes the cookie.
  if (value === null) {
    document.cookie = "token.csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  } else {
    document.cookie = `token.csrf=${value}; path=/`;
  }
}

beforeEach(() => {
  calls.length = 0;
  localStorage.setItem("access_token", "bearer-abc");
  setCsrfCookie(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return okJson({ data: { ok: true }, count: 0 });
    }),
  );
});

afterEach(async () => {
  // refreshAccessToken() coalesces callers on a module singleton that is
  // cleared on a macrotask — let it clear so the next test gets a fresh fetch.
  await new Promise((r) => setTimeout(r, 0));
  vi.unstubAllGlobals();
  localStorage.clear();
  setCsrfCookie(null);
});

describe("CSRF header on the generic client", () => {
  it("post() sends X-CSRF-Token equal to the token.csrf cookie", async () => {
    setCsrfCookie("csrf-value-1");
    await post("/api/v1/admin/auth/set-credentials/abc", { username: "u", password: "longenough" });
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0], "X-CSRF-Token")).toBe("csrf-value-1");
    // The bearer is still there — the CSRF header is additive, not a swap.
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer bearer-abc");
  });

  it("put() and del() send it too — every unsafe method, not just POST", async () => {
    setCsrfCookie("csrf-value-2");
    await put("/api/v1/update/thing/1", { x: 1 });
    await del("/api/v1/delete/thing/1");
    expect(calls.map((c) => c.init.method)).toEqual(["PUT", "DELETE"]);
    expect(headerOf(calls[0], "X-CSRF-Token")).toBe("csrf-value-2");
    expect(headerOf(calls[1], "X-CSRF-Token")).toBe("csrf-value-2");
  });

  it("uploadFile() (multipart POST) sends it", async () => {
    setCsrfCookie("csrf-value-3");
    const file = new File(["hello"], "a.txt", { type: "text/plain" });
    await uploadFile("/api/v1/upload/thing", file);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("POST");
    expect(headerOf(calls[0], "X-CSRF-Token")).toBe("csrf-value-3");
    // Multipart must keep letting the browser set the boundary.
    expect(headerOf(calls[0], "Content-Type")).toBeUndefined();
  });

  it("getOne() (safe method) does NOT send it even when the cookie is present", async () => {
    setCsrfCookie("csrf-value-4");
    await getOne("/api/v1/get/thing/1");
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method ?? "GET").toBe("GET");
    expect(headerOf(calls[0], "X-CSRF-Token")).toBeUndefined();
  });

  it("post() with NO cookie sends no header and does not throw", async () => {
    await post("/api/v1/create/thing", { x: 1 });
    expect(calls).toHaveLength(1);
    expect(headerOf(calls[0], "X-CSRF-Token")).toBeUndefined();
  });

  it("the retry after a 401→refresh re-reads the cookie, so a ROTATED token is sent", async () => {
    // Refresh rotates token.csrf server-side (the API re-issues it in
    // _set_auth_cookies). The retry must carry the NEW value, not the one
    // captured before the refresh.
    setCsrfCookie("before-refresh");
    let first = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, init });
        if (url.endsWith("/api/v1/auth/refresh")) {
          setCsrfCookie("after-refresh");
          return okJson({ data: { token: { access_token: "bearer-new" } } });
        }
        if (first) {
          first = false;
          return okJson({ detail: "expired" }, 401);
        }
        return okJson({ data: { ok: true } });
      }),
    );
    await post("/api/v1/admin/auth/set-credentials/abc", { username: "u", password: "longenough" });
    const attempts = calls.filter((c) => !c.url.endsWith("/api/v1/auth/refresh"));
    expect(attempts).toHaveLength(2);
    expect(headerOf(attempts[0], "X-CSRF-Token")).toBe("before-refresh");
    expect(headerOf(attempts[1], "X-CSRF-Token")).toBe("after-refresh");
    expect(headerOf(attempts[1], "Authorization")).toBe("Bearer bearer-new");
  });

  it("refreshAccessToken() still sends the header (unchanged contract)", async () => {
    setCsrfCookie("csrf-value-5");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, init });
        return okJson({ data: { token: { access_token: "bearer-new" } } });
      }),
    );
    await refreshAccessToken();
    expect(calls).toHaveLength(1);
    expect(calls[0].url.endsWith("/api/v1/auth/refresh")).toBe(true);
    expect(headerOf(calls[0], "X-CSRF-Token")).toBe("csrf-value-5");
  });

  // ---- Fix-round cases (Codex Pass-1 P1/P2 on the first cut) ----

  it("a DIRECT fetchWithRefresh caller (the SSE client / regenerate-pdf shape) gets the header — one choke point, not per-wrapper", async () => {
    setCsrfCookie("csrf-direct");
    await fetchWithRefresh("https://api.example/api/v1/agents/runs", () => ({
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer bearer-abc" },
      credentials: "include",
      body: "{}",
    }));
    expect(calls).toHaveLength(1);
    expect(headerOf(calls[0], "X-CSRF-Token")).toBe("csrf-direct");
    expect(headerOf(calls[0], "Authorization")).toBe("Bearer bearer-abc");
    expect(headerOf(calls[0], "Content-Type")).toBe("application/json");
  });

  it("PATCH through fetchWithRefresh gets the header (every unsafe verb)", async () => {
    setCsrfCookie("csrf-patch");
    await fetchWithRefresh("https://api.example/api/v1/thing", () => ({ method: "PATCH", headers: {}, credentials: "include" }));
    expect(headerOf(calls[0], "X-CSRF-Token")).toBe("csrf-patch");
  });

  it("the client's header WINS over a caller-supplied case-variant: exactly one CSRF key, canonical name, cookie value", async () => {
    setCsrfCookie("csrf-real");
    await rawRequest("/api/v1/create/thing", {
      method: "POST",
      headers: { "x-csrf-token": "spoofed", "X-Custom": "kept" },
      body: "{}",
    });
    const h = calls[0].init.headers as Record<string, string>;
    const csrfKeys = Object.keys(h).filter((k) => k.toLowerCase() === "x-csrf-token");
    expect(csrfKeys).toEqual(["X-CSRF-Token"]);
    expect(h["X-CSRF-Token"]).toBe("csrf-real");
    expect(h["X-Custom"]).toBe("kept");
  });

  it("the raw-fetch SSE cancel POST carries the header too", async () => {
    setCsrfCookie("csrf-cancel");
    await cancelAgentRun("run-1");
    const cancel = calls.find((c) => c.url.endsWith("/api/v1/agents/runs/run-1/cancel"));
    expect(cancel).toBeDefined();
    expect(cancel!.init.method).toBe("POST");
    expect(headerOf(cancel!, "X-CSRF-Token")).toBe("csrf-cancel");
  });

  it("a malformed (undecodable) cookie value yields NO header instead of throwing out of the request", async () => {
    document.cookie = "token.csrf=%E0%A4%A; path=/"; // truncated percent-escape
    await expect(post("/api/v1/create/thing", { x: 1 })).resolves.toBeDefined();
    expect(calls).toHaveLength(1);
    expect(headerOf(calls[0], "X-CSRF-Token")).toBeUndefined();
  });
});
