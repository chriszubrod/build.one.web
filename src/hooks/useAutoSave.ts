import { useCallback, useEffect, useRef } from "react";

/**
 * Debounced auto-save hook.
 * Calls `saveFn` after `delay` ms of inactivity whenever `deps` change.
 * Returns `flush()` to force an immediate save (e.g., before complete).
 *
 * Concurrency contract: at most one `saveFn` runs at a time. If a save is
 * requested (debounce timer or `flush()`) while one is already in flight, the
 * request is not dropped — a single coalesced follow-up run executes after the
 * in-flight save resolves, using the latest `saveFn`. The loop repeats until no
 * further request is pending. `flush()` resolves only after the latest state has
 * actually been persisted.
 *
 * NOTE for callers that both READ and WRITE server state guarded by an
 * optimistic-concurrency token (e.g. row_version): the coalesced follow-up may
 * run before React commits any state update the prior save queued. Source such
 * tokens via `useSyncedToken` (src/hooks/useSyncedToken.ts) — not from React
 * state — so chained saves don't send a stale token. See BillEdit /
 * TimeEntryView; ExpenseEdit still hand-rolls the ref pending its unpark.
 */
export function useAutoSave(
  saveFn: () => Promise<void>,
  deps: unknown[],
  delay = 300,
  enabled = true,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  const isSavingRef = useRef(false);
  const pendingRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasMountedRef = useRef(false);

  // Keep saveFn ref current without triggering the debounce effect.
  saveFnRef.current = saveFn;

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Single serialized runner. If a save is already in flight, mark a pending
  // follow-up and return the in-flight promise (resolves only once the follow-up
  // completes). Otherwise start a run that loops until no further save has been
  // requested. `saveFn` is never invoked concurrently with itself.
  //
  // The in-flight promise is published to inFlightRef SYNCHRONOUSLY (via an
  // explicit deferred) BEFORE saveFn is ever called, so a reentrant request made
  // from within saveFn (e.g. saveFn calls flush()) sees the real in-flight
  // promise rather than a spurious already-resolved one.
  const runSave = useCallback(() => {
    if (isSavingRef.current) {
      pendingRef.current = true;
      return inFlightRef.current ?? Promise.resolve();
    }
    isSavingRef.current = true;
    let resolveChain!: () => void;
    let rejectChain!: (err: unknown) => void;
    const chain = new Promise<void>((resolve, reject) => {
      resolveChain = resolve;
      rejectChain = reject;
    });
    inFlightRef.current = chain;
    void (async () => {
      try {
        do {
          pendingRef.current = false;
          await saveFnRef.current();
        } while (pendingRef.current);
        resolveChain();
      } catch (err) {
        rejectChain(err);
      } finally {
        isSavingRef.current = false;
        inFlightRef.current = null;
      }
    })();
    return chain;
  }, []);

  // Force an immediate save. Cancels the pending debounce first, then runs (or
  // coalesces into the in-flight run) and resolves only after the latest state
  // is persisted. Ignores `enabled` — a saveFn with a load gate must self-guard
  // (see BillEdit's persisted-total null check).
  const flush = useCallback(() => {
    cancel();
    return runSave();
  }, [cancel, runSave]);

  useEffect(() => {
    // Skip the initial mount — don't auto-save on first render.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (!enabled) return;

    cancel();
    timerRef.current = setTimeout(() => {
      runSave();
    }, delay);

    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Cleanup on unmount
  useEffect(() => cancel, [cancel]);

  return { flush, cancel };
}
