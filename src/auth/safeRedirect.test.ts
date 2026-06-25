import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safeRedirect";

// jsdom sets window.location.origin = "http://localhost:3000" — the
// safeRedirect tests below all rely on that origin being the "same" origin.

describe("safeRedirect", () => {
  describe("falls back to / for missing / empty input", () => {
    it("null", () => expect(safeRedirect(null)).toBe("/"));
    it("undefined", () => expect(safeRedirect(undefined)).toBe("/"));
    it("empty string", () => expect(safeRedirect("")).toBe("/"));
  });

  describe("accepts safe same-origin paths", () => {
    it("simple path", () => expect(safeRedirect("/bill/list")).toBe("/bill/list"));
    it("path with publicId", () =>
      expect(safeRedirect("/bill/C7538329-2394-41D5-972B-0439DA9C320E")).toBe(
        "/bill/C7538329-2394-41D5-972B-0439DA9C320E",
      ));
    it("path with query", () =>
      expect(safeRedirect("/bill/list?status=draft")).toBe("/bill/list?status=draft"));
    it("path with hash", () =>
      expect(safeRedirect("/bill/abc#line-3")).toBe("/bill/abc#line-3"));
    it("path with query AND hash", () =>
      expect(safeRedirect("/bill/list?status=draft#top")).toBe("/bill/list?status=draft#top"));
    it("root path", () => expect(safeRedirect("/")).toBe("/"));
    it("path with colon AFTER first slash (not a scheme)", () =>
      expect(safeRedirect("/bill/abc:def")).toBe("/bill/abc:def"));
  });

  describe("rejects external URLs", () => {
    it("https external", () =>
      expect(safeRedirect("https://evil.com/phish")).toBe("/"));
    it("http external", () =>
      expect(safeRedirect("http://evil.com")).toBe("/"));
    it("https with missing slashes after scheme", () =>
      expect(safeRedirect("https:evil.com")).toBe("/"));
  });

  describe("rejects protocol-relative URLs", () => {
    it("plain //evil.com", () =>
      expect(safeRedirect("//evil.com/path")).toBe("/"));
    it("//evil.com with userinfo spoof against a same-origin host", () =>
      expect(safeRedirect("//evil.com@localhost/legit")).toBe("/"));
  });

  describe("rejects path-traversal that normalises to protocol-relative", () => {
    // The URL constructor collapses `..` segments before yielding `pathname`,
    // so `/..//evil.com` becomes `//evil.com` — same origin as us, but the
    // assembled output is a protocol-relative URL. Hard-screen the output.
    it("/..//evil.com", () =>
      expect(safeRedirect("/..//evil.com")).toBe("/"));
    it("/foo/..//evil.com", () =>
      expect(safeRedirect("/foo/..//evil.com")).toBe("/"));
    it("/a/b/../..//evil.com", () =>
      expect(safeRedirect("/a/b/../..//evil.com")).toBe("/"));
    it("/../..//evil.com with query", () =>
      expect(safeRedirect("/../..//evil.com?x=1")).toBe("/"));
    it("/.//evil.com (single-dot segment)", () =>
      expect(safeRedirect("/.//evil.com")).toBe("/"));
  });

  describe("rejects control-character strip tricks", () => {
    // The URL constructor strips ASCII control chars (tab, CR, LF) per the
    // WHATWG spec. So an input like `/\t/evil.com` looks safe at the prefix
    // screen but parses as `//evil.com` — protocol-relative, foreign origin.
    // Caught by the `u.origin !== window.location.origin` check; tested here
    // as defense-in-depth so a future refactor doesn't lose the catch.
    it("/\\t/evil.com (tab)", () =>
      expect(safeRedirect("/\t/evil.com")).toBe("/"));
    it("/\\n/evil.com (LF)", () =>
      expect(safeRedirect("/\n/evil.com")).toBe("/"));
    it("/\\r/evil.com (CR)", () =>
      expect(safeRedirect("/\r/evil.com")).toBe("/"));
  });

  describe("rejects backslash tricks", () => {
    it("leading backslash", () =>
      expect(safeRedirect("\\\\evil.com/foo")).toBe("/"));
    it("slash-backslash hybrid", () =>
      expect(safeRedirect("/\\evil.com/foo")).toBe("/"));
  });

  describe("rejects javascript: and data: schemes", () => {
    it("javascript:", () =>
      expect(safeRedirect("javascript:alert(document.cookie)")).toBe("/"));
    it("JavaScript: (mixed case)", () =>
      expect(safeRedirect("JavaScript:alert(1)")).toBe("/"));
    it("data:text/html", () =>
      expect(safeRedirect("data:text/html,<script>alert(1)</script>")).toBe("/"));
  });

  describe("rejects bare hosts and absolute-but-no-scheme tricks", () => {
    it("evil.com (no scheme)", () =>
      expect(safeRedirect("evil.com/foo")).toBe("/"));
    it("file:// scheme", () =>
      expect(safeRedirect("file:///etc/passwd")).toBe("/"));
  });

  describe("always returns a value starting with /", () => {
    const inputs = [
      "https://evil.com",
      "//evil.com",
      "javascript:void(0)",
      "evil.com",
      "",
      null,
      "/legit",
      "/bill/abc",
    ];
    for (const input of inputs) {
      it(`for input: ${JSON.stringify(input)}`, () => {
        const out = safeRedirect(input);
        expect(out.startsWith("/")).toBe(true);
        expect(out.startsWith("//")).toBe(false);
      });
    }
  });
});
