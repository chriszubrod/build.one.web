import { useEffect, useState } from "react";

/**
 * Debounce a changing value: returns `value` only after it has stopped
 * changing for `ms` milliseconds. The canonical home for what used to be
 * three verbatim copies (admin users, contract labor, time entries) — a
 * search box typing into a query key wants exactly this and nothing more.
 *
 * The timer is re-armed whenever `value` or `ms` changes, so an in-flight
 * debounce for a stale value is always cancelled before it can land.
 */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
