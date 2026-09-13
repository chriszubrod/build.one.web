/**
 * Shared freshness helpers for the /docs manifest generators.
 */

/**
 * The branch a commit belongs to, resolved so a DETACHED build still reports
 * something meaningful.
 *
 * `git rev-parse --abbrev-ref HEAD` answers the literal string "HEAD" whenever
 * the checkout is detached — which is exactly the state a SAFE release build
 * runs in. Building from an isolated worktree at the pushed commit is what keeps
 * a dirty working tree out of the bundle (`swa deploy` ships whatever `dist`
 * holds), so the correct procedure was the one being penalised: prod `/docs`
 * displayed a "branch" that identifies nothing.
 *
 * Fall back to the refs pointing AT this commit — a local branch first, then a
 * remote-tracking one with its remote prefix stripped (`origin/main` → `main`).
 * The two namespaces are passed separately rather than sniffed apart by slash,
 * because a local branch may itself contain one (`feat/model-cascade`).
 *
 * When nothing points at the commit (building an older one), return null: the
 * manifest type is `string | null` and the UI renders "?", which is honest where
 * "HEAD" is not.
 *
 * @param {string|null} head          `git rev-parse --abbrev-ref HEAD`
 * @param {string[]} localRefs        short refnames under refs/heads pointing at HEAD
 * @param {string[]} remoteRefs       short refnames under refs/remotes pointing at HEAD
 * @returns {string|null}
 */
export function resolveBranchName(head, localRefs = [], remoteRefs = []) {
  if (head && head !== "HEAD") return head;

  const clean = (refs) => (refs ?? []).map((r) => r.trim()).filter(Boolean);

  const local = clean(localRefs)[0];
  if (local) return local;

  // Remote-tracking refs are always `<remote>/<branch>`, so a slash is REQUIRED
  // and dropping the first segment is safe even when the branch name contains
  // one. The slash test is not cosmetic: `refs/remotes/origin/HEAD` shortens to
  // a bare `origin`, which an `endsWith("/HEAD")` check sails straight past —
  // it would stamp the manifest with the REMOTE's name as if it were a branch.
  const remote = clean(remoteRefs).find((r) => r.includes("/") && !r.endsWith("/HEAD"));
  if (!remote) return null;
  return remote.slice(remote.indexOf("/") + 1) || null;
}
