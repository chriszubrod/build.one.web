/**
 * U-752: LaborList search through the shared ListFilterBar, with the real
 * router. `q` is URL-backed, so these assert on the LOCATION — the thing the
 * back-navigation round trip restores from.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, useEffect, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { setInputValue } from "../../__testutils__/domEvents";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../api/client")>();
  return {
    ...mod,
    getList: vi.fn(async () => ({ data: [], count: 0 })),
  };
});

vi.mock("../../hooks/useLookups", () => ({
  useLookups: () => ({ data: {}, isLoading: false }),
}));

const SEARCH = 'input[aria-label="Search labor entries by name, project, or sub cost code"]';

/** Every location the router has shown, in order. */
const locations: string[] = [];
let navigateFn: NavigateFunction;

function Probe() {
  const loc = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    navigateFn = navigate;
    locations.push(loc.pathname + loc.search);
  }, [navigate, loc]);
  return null;
}

/**
 * Emulate Chrome's removal-time blur. Chrome fires blur as a focused input is
 * removed and React can dispatch onBlur in that deletion commit; jsdom's React
 * does NOT (a focusout here reaches the still-connected input but the handler
 * never runs — probed for U-752), so call the input's React onBlur prop
 * directly, as React would.
 */
function fireRemovalBlur(input: Element | null) {
  // Fail loudly if the emulation can't run (no input, or React renamed its props key);
  // a silent no-op would let the removal-blur specs pass vacuously.
  if (!input) throw new Error("fireRemovalBlur: search input not found");
  const key = Object.keys(input).find((k) => k.startsWith("__reactProps$"));
  if (!key) throw new Error("fireRemovalBlur: React props key not found on the input");
  const props = (input as unknown as Record<string, { onBlur?: (e: unknown) => void }>)[key];
  if (!props.onBlur) throw new Error("fireRemovalBlur: input has no onBlur handler");
  props.onBlur(new FocusEvent("blur"));
}

/** Fires the removal-time blur from a later sibling's layout cleanup (input still in the DOM). */
function BlurOnRemove() {
  useLayoutEffect(() => () => {
    fireRemovalBlur(document.querySelector(SEARCH));
  }, []);
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  locations.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function mountAt(path: string, blurOnRemove = false) {
  const { default: LaborList } = await import("./LaborList");
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        createElement(
          MemoryRouter,
          { initialEntries: [path] },
          createElement(Probe),
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/labor/list", element: blurOnRemove
              ? createElement("section", null, createElement(LaborList), createElement(BlurOnRemove))
              : createElement(LaborList) }),
            createElement(Route, { path: "/labor/:id", element: createElement("div", { id: "detail" }, "detail") }),
          ),
        ),
      ),
    );
  });
}

const search = () => container.querySelector(SEARCH) as HTMLInputElement;
const current = () => locations.at(-1)!;
const qOf = (loc: string) => new URLSearchParams(loc.split("?")[1] ?? "").get("q");

describe("LaborList search (U-752, real router)", () => {
  it("writes q to the URL once typing pauses, never per keystroke", async () => {
    await mountAt("/labor/list");
    const before = locations.length;
    for (const v of ["j", "jo", "joe"]) {
      await act(async () => { setInputValue(search(), v); });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    expect(search().value).toBe("joe");
    expect(locations.slice(before).some((l) => qOf(l) !== null)).toBe(false);

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(qOf(current())).toBe("joe");
    const withQ = locations.slice(before).map(qOf).filter((q) => q !== null);
    expect(new Set(withQ)).toEqual(new Set(["joe"]));
  });

  it("adopts an external / back-navigation change to q without writing it back", async () => {
    await mountAt("/labor/list?q=alice");
    expect(search().value).toBe("alice");
    await act(async () => { navigateFn("/labor/list?q=bob"); });
    expect(search().value).toBe("bob");
    const n = locations.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    // No echo navigation after the adoption.
    expect(locations.slice(n).every((l) => l === "/labor/list?q=bob")).toBe(true);
    expect(current()).toBe("/labor/list?q=bob");
  });

  it("Clear removes q, from and to", async () => {
    await mountAt("/labor/list?status=ready&q=joe&from=2026-01-01&to=2026-02-01");
    const clear = container.querySelector('button[aria-label="Clear all filters"]') as HTMLButtonElement;
    await act(async () => { clear.click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(current()).toBe("/labor/list?status=ready");
    expect(search().value).toBe("");
  });

  it("blur flushes pending text to q at once — clicking a row (which blurs first) keeps the term", async () => {
    await mountAt("/labor/list");
    await act(async () => { setInputValue(search(), "joe"); });
    await act(async () => { search().dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(qOf(current())).toBe("joe");
  });

  it("Enter flushes pending text to q at once", async () => {
    await mountAt("/labor/list");
    await act(async () => { setInputValue(search(), "ann"); });
    await act(async () => {
      search().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(qOf(current())).toBe("ann");
  });

  it("navigating away with pending text (no blur) lands on the new page — the unmount flush must not bounce back", async () => {
    await mountAt("/labor/list");
    await act(async () => { setInputValue(search(), "joe"); });
    await act(async () => { navigateFn("/labor/abc"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(current()).toBe("/labor/abc");
    expect(container.querySelector("#detail")).not.toBeNull();
  });

  it("a removal-time blur (Chrome) while navigating away does not bounce back to the list", async () => {
    await mountAt("/labor/list", true);
    await act(async () => { setInputValue(search(), "joe"); });
    await act(async () => { navigateFn("/labor/abc"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(current()).toBe("/labor/abc");
    expect(container.querySelector("#detail")).not.toBeNull();
  });
});
