import { describe, it, expect } from "vitest";
import { act } from "react";
import { useSyncedToken } from "./useSyncedToken";
import { renderHook } from "./__testutils__/renderHook";

describe("useSyncedToken", () => {
  it("read() falls back to committed when ref unset", () => {
    const h = renderHook(() => useSyncedToken("v1"));
    expect(h.result.current.read()).toBe("v1");
  });

  it("set() is visible to read() synchronously, before any re-render", () => {
    const h = renderHook(() => useSyncedToken("v1"));
    h.result.current.set("v2");
    expect(h.result.current.read()).toBe("v2");
  });

  it("clears ref when committed changes and read() returns the new committed value", () => {
    let committed = "v1";
    const h = renderHook(() => useSyncedToken(committed));
    h.result.current.set("bridge");
    expect(h.result.current.read()).toBe("bridge");

    committed = "v2";
    act(() => {
      h.rerender();
    });
    expect(h.result.current.read()).toBe("v2");
  });

  it("handles null and undefined committed safely", () => {
    let committed: string | null | undefined = null;
    const h = renderHook(() => useSyncedToken(committed));
    expect(h.result.current.read()).toBeNull();

    h.result.current.set("bridge");
    expect(h.result.current.read()).toBe("bridge");

    committed = undefined;
    act(() => {
      h.rerender();
    });
    expect(h.result.current.read()).toBeUndefined();

    committed = "v1";
    act(() => {
      h.rerender();
    });
    expect(h.result.current.read()).toBe("v1");
  });
});
