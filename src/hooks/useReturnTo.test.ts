import { describe, it, expect } from "vitest";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import {
  listBasePathOf,
  returnToFromState,
  safeReturnTo,
  canonicalListPathname,
  useListLocation,
  useReturnTo,
} from "./useReturnTo";
import { renderHook } from "./__testutils__/renderHook";

function at(entry: string | { pathname: string; search?: string; state?: unknown }) {
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [entry] }, children);
}

const BILL_DEFAULT = "/bill/list?status=draft";
const EXPENSE_DEFAULT = "/expense/list?status=draft";

describe("safeReturnTo", () => {
  it.each([
    "/bill/list",
    "/bill/list?status=completed",
    "/bill/list?status=completed&from=2026-01-01&to=2026-03-31",
    "/bill/list?q=%2F%2Fevil",
  ])("accepts the entity's own list route: %s", (value) => {
    expect(safeReturnTo(value, "/bill/list")).toBe(value);
  });

  it.each([
    ["absolute URL", "https://evil.example/bill/list"],
    ["protocol-relative", "//evil.example"],
    ["protocol-relative that starts like the list", "//bill/list"],
    ["another app route", "/admin"],
    ["the other entity's list", "/expense/list?status=draft"],
    ["a sibling route sharing the prefix", "/bill/listing"],
    ["a sub-path of the list", "/bill/list/../../admin"],
    ["a record page", "/bill/abc/edit"],
    ["a fragment", "/bill/list#x"],
    ["a backslash", "/bill/list?x=\\evil"],
    ["whitespace", "/bill/list?status=draft x"],
    ["a control char", "/bill/list?status=draft\n"],
    ["javascript: URL", "javascript:alert(1)"],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(safeReturnTo(value, "/bill/list")).toBeNull();
  });

  it.each([undefined, null, 42, {}, ["/bill/list"]])("rejects a non-string (%s)", (value) => {
    expect(safeReturnTo(value, "/bill/list")).toBeNull();
  });
});

describe("returnToFromState", () => {
  it("reads a valid returnTo from router state", () => {
    expect(returnToFromState({ returnTo: "/expense/list?status=completed" }, "/expense/list")).toBe(
      "/expense/list?status=completed",
    );
  });

  it.each([null, undefined, "x", { other: 1 }, { returnTo: "https://evil" }])(
    "returns null for %s",
    (state) => {
      expect(returnToFromState(state, "/expense/list")).toBeNull();
    },
  );
});

describe("listBasePathOf", () => {
  it("strips the query string", () => {
    expect(listBasePathOf(BILL_DEFAULT)).toBe("/bill/list");
    expect(listBasePathOf("/bill/list")).toBe("/bill/list");
  });
});

describe("useReturnTo", () => {
  it("returns the origin list location from router state", () => {
    const origin = "/bill/list?status=completed&from=2026-01-01";
    const { result } = renderHook(() => useReturnTo(BILL_DEFAULT), {
      wrapper: at({ pathname: "/bill/b-1/edit", state: { returnTo: origin } }),
    });
    expect(result.current).toBe(origin);
  });

  it("falls back to the default (Draft tab) with no state", () => {
    const { result } = renderHook(() => useReturnTo(EXPENSE_DEFAULT), {
      wrapper: at("/expense/e-1"),
    });
    expect(result.current).toBe(EXPENSE_DEFAULT);
  });

  it.each(["https://evil", "//evil", "/admin", "/expense/list?status=draft"])(
    "falls back to the default for an unsafe or foreign returnTo (%s)",
    (returnTo) => {
      const { result } = renderHook(() => useReturnTo(BILL_DEFAULT), {
        wrapper: at({ pathname: "/bill/b-1/edit", state: { returnTo } }),
      });
      expect(result.current).toBe(BILL_DEFAULT);
    },
  );

});

describe("useListLocation", () => {
  it("is pathname + search", () => {
    const { result } = renderHook(() => useListLocation("/bill/list"), {
      wrapper: at("/bill/list?status=completed&from=2026-01-01"),
    });
    expect(result.current).toBe("/bill/list?status=completed&from=2026-01-01");
  });

  it.each(["/bill/list/", "/Bill/List", "/BILL/LIST//"])(
    "canonicalises a router-equivalent list path (%s) so the origin survives safeReturnTo",
    (pathname) => {
      const { result } = renderHook(() => useListLocation("/bill/list"), {
        wrapper: at(`${pathname}?status=completed&from=2026-01-01`),
      });
      expect(result.current).toBe("/bill/list?status=completed&from=2026-01-01");
      expect(safeReturnTo(result.current, "/bill/list")).toBe(result.current);
    },
  );
});

describe("canonicalListPathname", () => {
  it("leaves non-list paths alone (safeReturnTo still rejects them)", () => {
    expect(canonicalListPathname("/bill/listing", "/bill/list")).toBe("/bill/listing");
    expect(canonicalListPathname("/expense/list/", "/bill/list")).toBe("/expense/list/");
    expect(canonicalListPathname("/bill/list", "/bill/list")).toBe("/bill/list");
  });
});
