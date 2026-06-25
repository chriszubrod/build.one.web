/**
 * Validate a user-supplied post-login redirect target against open-redirect abuse.
 *
 * The threat model: an attacker sends a victim a link like
 *   https://app.buildone.com/login?redirect=https://evil.com/phish
 * If the app trusts the `redirect` param and navigates to it after login,
 * the user lands on attacker-controlled territory while believing they
 * just signed into the real app. This is the OWASP "Unvalidated Redirects
 * and Forwards" class; it has wrecked enterprise SSO flows for two decades.
 *
 * Safe iff ALL of:
 *   1. Starts with a single `/` (relative path on this origin).
 *   2. Does NOT start with `//`, `\\`, or `/\` (protocol-relative tricks).
 *   3. Resolves to the same origin under `new URL(target, location.origin)`.
 *
 * The URL-constructor pass is defense-in-depth: it catches `javascript:`,
 * `data:`, userinfo-spoof (`//evil.com@app.buildone.com/legit`), and any
 * other scheme/host shape the prefix check missed.
 *
 * Returns either the validated path (always starting with `/`) or `/`
 * when the input is missing or fails any check.
 */
export function safeRedirect(target: string | null | undefined): string {
  if (!target) return "/";

  // Cheap prefix screen — reject anything that obviously isn't a same-origin
  // path. `new URL()` is permissive and would happily parse e.g.
  // `https:evil.com` as a scheme + opaque path, so we don't rely on it alone.
  if (!target.startsWith("/")) return "/";
  if (target.startsWith("//")) return "/";
  if (target.startsWith("/\\") || target.startsWith("\\")) return "/";

  try {
    const u = new URL(target, window.location.origin);
    if (u.origin !== window.location.origin) return "/";
    const out = u.pathname + u.search + u.hash;
    // Re-screen the assembled output: the URL constructor normalises
    // `..` segments, so an input like `/..//evil.com` collapses to a
    // pathname of `//evil.com` — same `origin` as us, but assigning
    // that string to `window.location.href` triggers a protocol-relative
    // navigation to evil.com. Catch any output that would do that.
    if (out.startsWith("//") || out.startsWith("/\\")) return "/";
    return out;
  } catch {
    return "/";
  }
}
