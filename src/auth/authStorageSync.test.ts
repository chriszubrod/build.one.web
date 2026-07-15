/**
 * Cross-tab auth-sync predicate test (U-032).
 *
 * `shouldReloadOnStorage` decides whether a cross-tab `storage` event is a
 * real auth IDENTITY transition (→ hard reload, to re-run boot-time
 * per-user persister keying) versus noise that must be ignored. Identity is
 * the access token's `uid` claim — the same value `main.tsx` keys the
 * persister on. The key regression this guards: a same-user access-token
 * REFRESH (`client.ts` rewrites `access_token` ~hourly / on 401 with the
 * SAME uid) must NOT trigger a reload — a reload there discards unsaved work
 * on non-auto-save surfaces. A same-username/new-uid swap MUST still reload.
 */
import { describe, it, expect } from "vitest";
import { shouldReloadOnStorage } from "./authStorageSync";

type StorageEventLike = Pick<
  StorageEvent,
  "key" | "oldValue" | "newValue" | "storageArea"
>;

// Build a minimal StorageEvent-shaped object. Defaults to the real
// localStorage area so the storageArea guard passes unless overridden.
function ev(partial: Partial<StorageEventLike>): StorageEventLike {
  return {
    key: null,
    oldValue: null,
    newValue: null,
    storageArea: window.localStorage,
    ...partial,
  };
}

// Build a non-verifying JWT that decodes to the given payload (mirrors the
// helper in cacheCleanup.test.ts). We only read the payload client-side.
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (s: string) =>
    btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

// A distinct Storage area standing in for sessionStorage. In this test
// harness `window.sessionStorage` is aliased to the SAME shim as
// `window.localStorage` (see vitest.setup.ts), so we need a separate
// sentinel object to represent "a different storage area".
const otherArea = {} as Storage;

describe("shouldReloadOnStorage", () => {
  it("reloads when username changes (login-as-different-user A→B)", () => {
    expect(
      shouldReloadOnStorage(ev({ key: "username", oldValue: "alice", newValue: "bob" })),
    ).toBe(true);
  });

  it("reloads when username appears (login null→value)", () => {
    expect(
      shouldReloadOnStorage(ev({ key: "username", oldValue: null, newValue: "alice" })),
    ).toBe(true);
  });

  it("reloads when username is removed (logout value→null)", () => {
    expect(
      shouldReloadOnStorage(ev({ key: "username", oldValue: "alice", newValue: null })),
    ).toBe(true);
  });

  it("reloads when access_token is removed (logout belt-and-suspenders)", () => {
    expect(
      shouldReloadOnStorage(
        ev({ key: "access_token", oldValue: makeJwt({ uid: "user-A" }), newValue: null }),
      ),
    ).toBe(true);
  });

  it("reloads when access_token appears (login null→token)", () => {
    expect(
      shouldReloadOnStorage(
        ev({ key: "access_token", oldValue: null, newValue: makeJwt({ uid: "user-B" }) }),
      ),
    ).toBe(true);
  });

  it("reloads when the access_token uid changes even if the username string is unchanged (same-username/new-uid swap)", () => {
    // The finding this predicate closes: identity is uid, not the username
    // string. A token swap to a different uid must re-key the cache.
    expect(
      shouldReloadOnStorage(
        ev({
          key: "access_token",
          oldValue: makeJwt({ uid: "user-A", iat: 1 }),
          newValue: makeJwt({ uid: "user-B", iat: 1 }),
        }),
      ),
    ).toBe(true);
  });

  it("does NOT reload on a same-user access_token refresh (the U-032 bug)", () => {
    // Same uid, different token string (new iat/exp/signature) — a refresh.
    expect(
      shouldReloadOnStorage(
        ev({
          key: "access_token",
          oldValue: makeJwt({ uid: "user-A", iat: 1 }),
          newValue: makeJwt({ uid: "user-A", iat: 2 }),
        }),
      ),
    ).toBe(false);
  });

  it("does NOT reload for a sessionStorage write", () => {
    expect(
      shouldReloadOnStorage(
        ev({ key: "username", oldValue: "alice", newValue: "bob", storageArea: otherArea }),
      ),
    ).toBe(false);
  });

  it("does NOT reload for an unrelated localStorage key", () => {
    expect(
      shouldReloadOnStorage(ev({ key: "theme", oldValue: "light", newValue: "dark" })),
    ).toBe(false);
  });

  it("does NOT reload on a no-op write (oldValue === newValue)", () => {
    const token = makeJwt({ uid: "user-A" });
    expect(
      shouldReloadOnStorage(ev({ key: "access_token", oldValue: token, newValue: token })),
    ).toBe(false);
  });
});
