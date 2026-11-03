import { useLocation } from "react-router-dom";

/**
 * Return to where the user was (U-753).
 *
 * Every entry from a list into a record carries the list location it came
 * from (pathname + search) in router location state as `{ returnTo }`. Save /
 * Cancel / Complete and the list breadcrumb on the record go back there — so a
 * user working the Completed tab with a date range lands back on exactly that
 * view — and fall back to the entity's default list (its Draft tab) when the
 * record was opened directly (bookmark, reload in a new tab, deep link).
 *
 * Location state is client-controlled (`history.pushState` from anywhere on
 * the origin), so the value is never followed blindly: it must be the entity's
 * own list route plus an optional query string. Anything else — an absolute
 * URL, a protocol-relative `//host`, another app route, a fragment, a
 * backslash — resolves to the default.
 */

export interface ReturnToState {
  returnTo: string;
}

/** `/bill/list?status=draft` → `/bill/list`. */
export function listBasePathOf(listPath: string): string {
  const q = listPath.indexOf("?");
  return q === -1 ? listPath : listPath.slice(0, q);
}

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const UNSAFE_CHARS = /[\\#\s\u0000-\u001f\u007f]/;

/**
 * `value` if it is exactly `listBasePath` optionally followed by a query
 * string, else null.
 */
export function safeReturnTo(value: unknown, listBasePath: string): string | null {
  if (typeof value !== "string") return null;
  if (!listBasePath.startsWith("/") || listBasePath.startsWith("//")) return null;
  if (!value.startsWith(listBasePath)) return null;
  const tail = value.slice(listBasePath.length);
  if (tail !== "" && !tail.startsWith("?")) return null;
  if (UNSAFE_CHARS.test(value)) return null;
  return value;
}

/** The validated `returnTo` carried in a router location state, or null. */
export function returnToFromState(state: unknown, listBasePath: string): string | null {
  if (state === null || typeof state !== "object" || !("returnTo" in state)) return null;
  return safeReturnTo((state as { returnTo: unknown }).returnTo, listBasePath);
}

/**
 * Where a record page should send the user back to: the list location it was
 * opened from when present and safe, else `defaultListPath`. The allowed list
 * route is `defaultListPath` without its query string.
 */
export function useReturnTo(defaultListPath: string): string {
  const { state } = useLocation();
  return returnToFromState(state, listBasePathOf(defaultListPath)) ?? defaultListPath;
}

/** Router state for a navigation that should keep `returnTo` (Edit ↔ View, next draft). */
export function returnToState(returnTo: string): ReturnToState {
  return { returnTo };
}

/**
 * The list page's pathname in canonical form. React Router matches routes
 * case-insensitively and ignores a trailing slash, so `/Bill/List/` renders the
 * Bills list — but `safeReturnTo` (deliberately strict) would reject it and
 * the user would lose their tab and filters. Any path that is the list route
 * modulo case / trailing slashes maps to `listBasePath`; anything else is
 * returned unchanged (and then rejected by `safeReturnTo` as before).
 */
export function canonicalListPathname(pathname: string, listBasePath: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed.toLowerCase() === listBasePath.toLowerCase() ? listBasePath : pathname;
}

/**
 * On a list page: the current location (canonical list pathname + search) to
 * carry into a record. `listBasePath` is the list route, e.g. `/bill/list`.
 */
export function useListLocation(listBasePath: string): string {
  const { pathname, search } = useLocation();
  return `${canonicalListPathname(pathname, listBasePath)}${search}`;
}
