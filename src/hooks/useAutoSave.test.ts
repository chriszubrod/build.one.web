import { describe, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useAutoSave } from "./useAutoSave";

// React 19 requires this global for act() to run without warnings.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Deferred = { promise: Promise<void>; resolve: () => void };
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Drain queued promise microtasks (the do/while continuations). Microtasks are
// NOT faked by vi.useFakeTimers(), so real awaits advance the save loop.
async function drain(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

type SaveFn = () => Promise<void>;
type AutoSaveReturn = ReturnType<typeof useAutoSave>;

// Minimal renderHook harness — no @testing-library/react dependency.
function renderAutoSave(
  initialSaveFn: SaveFn,
  initialDeps: unknown[],
  delay = 300,
  enabled = true,
) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const result = { current: undefined as unknown as AutoSaveReturn };
  let saveFn = initialSaveFn;
  let deps = initialDeps;

  function TestComponent() {
    result.current = useAutoSave(saveFn, deps, delay, enabled);
    return null;
  }

  act(() => {
    root.render(createElement(TestComponent));
  });

  return {
    result,
    rerender: (next: { saveFn?: SaveFn; deps?: unknown[] }) => {
      if (next.saveFn) saveFn = next.saveFn;
      if (next.deps) deps = next.deps;
      act(() => {
        root.render(createElement(TestComponent));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("useAutoSave", () => {
  // (a) An edit made during an in-flight save is persisted (rescheduled), using
  // the latest saveFn — not dropped.
  it("reschedules a save requested via the debounce timer during an in-flight save", async () => {
    vi.useFakeTimers();
    try {
      const calls: Deferred[] = [];
      const seen: string[] = [];
      const makeSaveFn = (tag: string): SaveFn =>
        vi.fn(() => {
          seen.push(tag);
          const d = deferred();
          calls.push(d);
          return d.promise;
        });

      const save1 = makeSaveFn("edit-B");
      const h = renderAutoSave(save1, [1]);

      h.rerender({ deps: [2] });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(calls.length).toBe(1);

      const save2 = makeSaveFn("edit-C");
      h.rerender({ saveFn: save2, deps: [3] });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(save2).toHaveBeenCalledTimes(0);
      expect(calls.length).toBe(1);

      calls[0].resolve();
      await drain();
      expect(save2).toHaveBeenCalledTimes(1);
      expect(seen).toEqual(["edit-B", "edit-C"]);

      calls[1].resolve();
      await drain();
    } finally {
      vi.useRealTimers();
    }
  });

  // (b) flush() during an in-flight save awaits AND persists the latest state.
  it("flush() during an in-flight save awaits and persists the latest state", async () => {
    const calls: Deferred[] = [];
    const seen: string[] = [];
    let latest = "A";
    const saveFn: SaveFn = vi.fn(() => {
      seen.push(latest);
      const d = deferred();
      calls.push(d);
      return d.promise;
    });

    const h = renderAutoSave(saveFn, [0]);

    latest = "A";
    const flush1 = h.result.current.flush();
    await drain();
    expect(saveFn).toHaveBeenCalledTimes(1);

    latest = "B";
    const flush2 = h.result.current.flush();
    await drain();
    expect(saveFn).toHaveBeenCalledTimes(1);

    let flush2Resolved = false;
    void flush2.then(() => {
      flush2Resolved = true;
    });
    await drain();
    expect(flush2Resolved).toBe(false);

    calls[0].resolve();
    await drain();
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(seen[1]).toBe("B");
    expect(flush2Resolved).toBe(false);

    calls[1].resolve();
    await drain();
    await flush2;
    expect(flush2Resolved).toBe(true);
    expect(flush1).toBeInstanceOf(Promise);
  });

  // (c) No two saveFn calls ever overlap.
  it("never runs two saveFn calls concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const calls: Deferred[] = [];
    const saveFn: SaveFn = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const d = deferred();
      calls.push(d);
      await d.promise;
      active -= 1;
    });

    const h = renderAutoSave(saveFn, [0]);

    const p1 = h.result.current.flush();
    const p2 = h.result.current.flush();
    const p3 = h.result.current.flush();
    await drain();
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(maxActive).toBe(1);

    calls[0].resolve();
    await drain();
    expect(maxActive).toBe(1);

    for (const c of calls) c.resolve();
    await drain();
    await Promise.all([p1, p2, p3]);
    expect(maxActive).toBe(1);
  });

  // (d) Initial-mount skip preserved.
  it("does not auto-save on initial mount", async () => {
    vi.useFakeTimers();
    try {
      const saveFn: SaveFn = vi.fn(async () => {});
      renderAutoSave(saveFn, [0]);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      await drain();
      expect(saveFn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // (e) Reentrancy hardening (P3): a flush() invoked synchronously from inside
  // saveFn must NOT resolve early — it must await the in-flight save + follow-up.
  it("a flush() called synchronously from within saveFn does not resolve early", async () => {
    const calls: Deferred[] = [];
    let hookApi: AutoSaveReturn | undefined;
    let reentrantFlush: Promise<void> | undefined;
    const saveFn: SaveFn = vi.fn(() => {
      const d = deferred();
      calls.push(d);
      if (calls.length === 1) {
        // Re-enter flush synchronously during the very first save.
        reentrantFlush = hookApi!.flush();
      }
      return d.promise;
    });

    const h = renderAutoSave(saveFn, [0]);
    hookApi = h.result.current;

    const p1 = hookApi.flush();
    await drain();
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(reentrantFlush).toBeInstanceOf(Promise);

    let reentrantResolved = false;
    void reentrantFlush!.then(() => {
      reentrantResolved = true;
    });
    await drain();
    // Must not resolve while save #1 is still in flight.
    expect(reentrantResolved).toBe(false);

    calls[0].resolve();
    await drain();
    // The reentrant flush set pendingRef, so a follow-up (#2) runs.
    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(reentrantResolved).toBe(false);

    calls[1].resolve();
    await drain();
    await reentrantFlush;
    expect(reentrantResolved).toBe(true);
    await p1;
  });

  // (f) The mechanism the row_version fix relies on: a value written by one save
  // iteration (into a plain ref) is visible to the coalesced follow-up, so the
  // follow-up sends the FRESH token, not a stale one.
  it("a value written by one save iteration is visible to the coalesced follow-up", async () => {
    const versionRef = { current: 1 };
    const sent: Array<{ field: string; version: number }> = [];
    const calls: Deferred[] = [];
    const makeSaveFn = (field: string): SaveFn => async () => {
      const version = versionRef.current; // read fresh token from ref
      sent.push({ field, version });
      const d = deferred();
      calls.push(d);
      await d.promise;
      versionRef.current = version + 1; // synchronous bump on success
    };

    vi.useFakeTimers();
    try {
      const h = renderAutoSave(makeSaveFn("A"), [1]);
      h.rerender({ deps: [2] });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      // Edit to B during flight — new closure captures field B, ref still 1.
      h.rerender({ saveFn: makeSaveFn("B"), deps: [3] });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      calls[0].resolve(); // #1 done -> versionRef becomes 2
      await drain();
      calls[1].resolve(); // follow-up #2
      await drain();
      expect(sent).toEqual([
        { field: "A", version: 1 },
        { field: "B", version: 2 }, // follow-up used the FRESH version, not stale 1
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
