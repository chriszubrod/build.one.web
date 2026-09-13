import { describe, expect, it } from "vitest";

import { resolveBranchName } from "./docs-freshness.mjs";

// Pins the fix from the 2026-09-13 web deploy: the manifest stamped
// source_branch "HEAD" whenever the build ran detached — i.e. whenever it ran
// the SAFE way, from an isolated worktree at the pushed commit, which is what
// keeps a dirty working tree out of `dist`. The correct procedure was the one
// producing the useless badge.
describe("resolveBranchName", () => {
  it("uses the checked-out branch when attached", () => {
    expect(resolveBranchName("main", [], [])).toBe("main");
  });

  it("prefers the attached branch over any pointing refs", () => {
    expect(resolveBranchName("main", ["other"], ["origin/other"])).toBe("main");
  });

  it("keeps a slashed branch name intact when attached", () => {
    expect(resolveBranchName("feat/model-cascade", [], [])).toBe("feat/model-cascade");
  });

  // The headline case: detached worktree build at the pushed commit.
  //
  // The two ref lists deliberately DISAGREE. With ["main"] / ["origin/main"]
  // both branches of the fallback return "main", so the test could not tell the
  // local-first preference from a remote-first one and passed either way.
  it("prefers the local branch pointing at the commit when detached", () => {
    expect(resolveBranchName("HEAD", ["release-cut"], ["origin/main"])).toBe("release-cut");
  });

  it("falls back to a remote-tracking ref with the remote prefix stripped", () => {
    expect(resolveBranchName("HEAD", [], ["origin/main"])).toBe("main");
  });

  // A local branch may contain a slash, which is why the two ref namespaces are
  // passed separately instead of being sniffed apart by looking for one.
  it("does not mistake a slashed LOCAL branch for a remote-tracking ref", () => {
    expect(resolveBranchName("HEAD", ["feat/model-cascade"], [])).toBe("feat/model-cascade");
  });

  // Remote-tracking refs really are <remote>/<branch>, so only the FIRST
  // segment is a remote name.
  it("strips only the remote name from a slashed remote branch", () => {
    expect(resolveBranchName("HEAD", [], ["origin/feat/model-cascade"])).toBe("feat/model-cascade");
  });

  it("ignores origin/HEAD, which names no branch", () => {
    expect(resolveBranchName("HEAD", [], ["origin/HEAD", "origin/main"])).toBe("main");
  });

  it("returns null when origin/HEAD is the only pointing ref", () => {
    expect(resolveBranchName("HEAD", [], ["origin/HEAD"])).toBeNull();
  });

  // Found by running the real thing, not by reasoning about it: git shortens
  // `refs/remotes/origin/HEAD` to a bare `origin` (no slash), which the
  // endsWith("/HEAD") guard alone does not catch. Without requiring a slash the
  // manifest would claim the REMOTE's name was a branch.
  it("ignores a bare remote name, which is origin/HEAD shortened", () => {
    expect(resolveBranchName("HEAD", [], ["origin", "origin/main"])).toBe("main");
  });

  it("returns null when a bare remote name is the only pointing ref", () => {
    expect(resolveBranchName("HEAD", [], ["origin"])).toBeNull();
  });

  // Honest over decorative: the manifest type is `string | null` and the UI
  // renders "?", which says "unknown". "HEAD" said something false-looking.
  it("returns null when nothing points at the commit", () => {
    expect(resolveBranchName("HEAD", [], [])).toBeNull();
  });

  it("returns null when git itself failed", () => {
    expect(resolveBranchName(null, [], [])).toBeNull();
  });

  it("tolerates whitespace and blank lines from git output", () => {
    expect(resolveBranchName("HEAD", ["", "  main  "], [])).toBe("main");
  });
});
