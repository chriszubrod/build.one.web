/**
 * Minimal client-side JWT payload decoder. We don't VERIFY the token here —
 * the server is the source of truth — we just read the payload to derive
 * the active user's public_id for cache keying.
 *
 * The token's signature is checked on every API call (the server rejects
 * tampered tokens). Reading the payload locally only gives us a
 * routing/UX hint; it carries no authorization weight.
 */
export interface JwtPayload {
  /** User.PublicId (UUID string) — see API CLAUDE.md "Access Control Rebuild". */
  uid?: string;
  /** Active Company.PublicId */
  cid?: string;
  /** IsSystemAdmin */
  isa?: boolean;
  /** Auth.PublicId (NOT the user id — see API note on auth vs user entities). */
  sub?: string;
  /** Expiry epoch seconds */
  exp?: number;
  /** Issued-at epoch seconds */
  iat?: number;
}

export function decodeJwtPayload(token: string | null | undefined): JwtPayload | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const b64url = parts[1];
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Derives the current user's PublicId from the access token in localStorage.
 * Returns null if not signed in or token shape is unexpected.
 */
export function getUserPublicIdFromStorage(): string | null {
  const token = typeof localStorage === "undefined" ? null : localStorage.getItem("access_token");
  return decodeJwtPayload(token)?.uid ?? null;
}
