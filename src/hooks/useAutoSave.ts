import { useCallback, useEffect, useRef } from "react";

/**
 * Debounced auto-save hook.
 * Calls `saveFn` after `delay` ms of inactivity whenever `deps` change.
 * Returns `flush()` to force an immediate save (e.g., before complete).
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
  const hasMountedRef = useRef(false);

  // Keep saveFn ref current without triggering effect
  saveFnRef.current = saveFn;

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = useCallback(async () => {
    cancel();
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      await saveFnRef.current();
    } finally {
      isSavingRef.current = false;
    }
  }, [cancel]);

  useEffect(() => {
    // Skip the initial mount — don't auto-save on first render
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (!enabled) return;

    cancel();
    timerRef.current = setTimeout(() => {
      if (!isSavingRef.current) {
        isSavingRef.current = true;
        saveFnRef.current().finally(() => {
          isSavingRef.current = false;
        });
      }
    }, delay);

    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Cleanup on unmount
  useEffect(() => cancel, [cancel]);

  return { flush, cancel };
}
