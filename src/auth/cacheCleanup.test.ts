/**
 * Multi-user state-bleed contract test.
 *
 * Verifies the cleanup primitive that prevents the iOS v0.1.0-class bug
 * from shipping to web: when user A signs out on a shared device, every
 * per-user storage surface must be cleared before user B signs in.
 *
 * This file is the canonical regression gate for PWA Tier 2. If a future
 * change drops one of the cleanup awaits or fails to enumerate a new
 * cache name, the assertions here should catch it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { get, set, entries, del } from "idb-keyval";
import { clearAllUserScopedStorage } from "./cacheCleanup";

// Minimal CacheStorage stub — tracks delete calls so the test can
// assert which SW caches were targeted. jsdom doesn't ship CacheStorage.
function installFakeCaches(initialKeys: string[]) {
  const present = new Set(initialKeys);
  const deletes: string[] = [];
  const fake = {
    keys: vi.fn(async () => Array.from(present)),
    delete: vi.fn(async (name: string) => {
      deletes.push(name);
      return present.delete(name);
    }),
  } as unknown as CacheStorage;
  (globalThis as { caches?: CacheStorage }).caches = fake;
  return { deletes, fake };
}

// Build a non-verifying JWT that decodes to the given payload.
function makeFakeJwt(payload: Record<string, unknown>): string {
  const b64 = (s: string) =>
    btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe("clearAllUserScopedStorage", () => {
  beforeEach(async () => {
    // Reset every cross-test global. Remove only the keys we set so we
    // don't depend on jsdom's optional Storage methods (some versions
    // omit clear()).
    localStorage.removeItem("access_token");
    localStorage.removeItem("username");
    // idb-keyval has no clear-all without specifying a store; walk
    // every entry instead.
    for (const [key] of await entries()) {
      await del(key as IDBValidKey);
    }
    // Drop the caches stub.
    delete (globalThis as { caches?: CacheStorage }).caches;
  });

  it("deletes the current user's persister key AND the guest key", async () => {
    // Set up: user A is signed in. uid is the JWT's uid claim.
    const uid = "user-A-public-id-123";
    localStorage.setItem("access_token", makeFakeJwt({ uid }));

    // Both surface keys exist in IndexedDB.
    await set(`bo.rq.v1.${uid}`, "user-A-cached-payload");
    await set("bo.rq.v1.guest", "guest-residual-data");
    await set("bo.rq.v1.user-X-OTHER", "other-user-data-must-survive");

    const { deletes } = installFakeCaches(["bo-api-reads-v1"]);

    await clearAllUserScopedStorage();

    // Current user + guest are gone.
    expect(await get(`bo.rq.v1.${uid}`)).toBeUndefined();
    expect(await get("bo.rq.v1.guest")).toBeUndefined();
    // Other users' cached payloads are explicitly preserved — clearing
    // those would surprise a different signed-out user.
    expect(await get("bo.rq.v1.user-X-OTHER")).toBe("other-user-data-must-survive");
    // SW runtime cache was deleted.
    expect(deletes).toContain("bo-api-reads-v1");
  });

  it("clears only the guest key when no user is signed in", async () => {
    // No access_token in localStorage.
    await set("bo.rq.v1.guest", "guest-payload");
    await set("bo.rq.v1.someone-elses-uid", "stale-prior-user");

    installFakeCaches(["bo-api-reads-v1"]);

    await clearAllUserScopedStorage();

    expect(await get("bo.rq.v1.guest")).toBeUndefined();
    // We don't enumerate every key — only known prefix paths get touched.
    expect(await get("bo.rq.v1.someone-elses-uid")).toBe("stale-prior-user");
  });

  it("tolerates a missing global caches API (e.g. private mode)", async () => {
    localStorage.setItem("access_token", makeFakeJwt({ uid: "user-A" }));
    await set("bo.rq.v1.user-A", "payload");
    // Don't install fake caches.

    // Should not throw even though caches is undefined.
    await expect(clearAllUserScopedStorage()).resolves.toBeUndefined();
    expect(await get("bo.rq.v1.user-A")).toBeUndefined();
  });

  it("does not throw when an individual delete fails", async () => {
    localStorage.setItem("access_token", makeFakeJwt({ uid: "user-A" }));
    await set("bo.rq.v1.user-A", "payload");
    await set("bo.rq.v1.guest", "guest-payload");

    // caches.delete that throws on the SW cache name.
    const fakeCaches = {
      keys: vi.fn(async () => ["bo-api-reads-v1"]),
      delete: vi.fn(async () => {
        throw new Error("simulated cache delete failure");
      }),
    } as unknown as CacheStorage;
    (globalThis as { caches?: CacheStorage }).caches = fakeCaches;

    // Should resolve cleanly; individual failures are logged not thrown.
    await expect(clearAllUserScopedStorage()).resolves.toBeUndefined();
    // The idb-keyval deletes still happened.
    expect(await get("bo.rq.v1.user-A")).toBeUndefined();
    expect(await get("bo.rq.v1.guest")).toBeUndefined();
  });

  it("handles a malformed JWT in localStorage without crashing", async () => {
    localStorage.setItem("access_token", "not-a-valid-jwt-at-all");
    await set("bo.rq.v1.guest", "guest-payload");

    installFakeCaches(["bo-api-reads-v1"]);

    // Should still clear the guest key.
    await expect(clearAllUserScopedStorage()).resolves.toBeUndefined();
    expect(await get("bo.rq.v1.guest")).toBeUndefined();
  });

  it("clears agent transcript localStorage keys (intelligence.conversation.*)", async () => {
    // Set up: user signed in with some agent chat history persisted.
    localStorage.setItem("access_token", makeFakeJwt({ uid: "user-A" }));
    localStorage.setItem("username", "user-a-name");
    localStorage.setItem("intelligence.conversation.buildone.v2", "buildone-current-thread");
    localStorage.setItem("intelligence.conversations.buildone.v2", JSON.stringify([{ id: 1 }]));
    localStorage.setItem("intelligence.conversation.bill_specialist.v2", "bill-thread");
    // A non-matching key that must be preserved.
    localStorage.setItem("unrelated.app.setting", "keep-me");

    installFakeCaches([]);

    await clearAllUserScopedStorage();

    // All agent transcript keys are gone.
    expect(localStorage.getItem("intelligence.conversation.buildone.v2")).toBeNull();
    expect(localStorage.getItem("intelligence.conversations.buildone.v2")).toBeNull();
    expect(localStorage.getItem("intelligence.conversation.bill_specialist.v2")).toBeNull();
    // Unrelated entries survive — we don't nuke localStorage indiscriminately.
    expect(localStorage.getItem("unrelated.app.setting")).toBe("keep-me");
  });
});
