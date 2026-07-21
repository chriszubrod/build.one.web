import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Authoritative optimistic-concurrency token bridge.
 *
 * Holds the latest server-issued token (e.g. `row_version`) in a ref updated
 * SYNCHRONOUSLY on every successful save. Chained saves — the auto-save
 * reschedule loop, and saveAll right after flush on Complete — read via
 * `read()` instead of the possibly-stale React-state committed value, whose
 * setState may not have committed yet. Prevents a stale token → optimistic-
 * concurrency conflict → silently lost edit.
 *
 * The clear-effect resets the ref once `committed` changes (a local save's
 * setForm OR an external hydration), so the next save reads the authoritative
 * committed value. The ref only bridges the pre-commit window of the coalesced
 * follow-up and the Complete-path saveAll (both read synchronously, before the
 * effect runs). See the NOTE in useAutoSave.ts.
 */
export function useSyncedToken(committed: string | null | undefined) {
  const ref = useRef<string | null>(null);

  // Bridge only the pre-commit window — see the JSDoc above.
  useEffect(() => {
    ref.current = null;
  }, [committed]);

  const read = useCallback(() => ref.current ?? committed, [committed]);
  const set = useCallback((v: string) => {
    ref.current = v;
  }, []);

  // Stable identity (changes only when `committed` does) so callers can list
  // the returned object in dep arrays without defeating their memoization.
  return useMemo(() => ({ read, set }), [read, set]);
}
