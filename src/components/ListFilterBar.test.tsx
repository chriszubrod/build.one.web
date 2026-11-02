/**
 * U-752: the shared Search / From / To / Clear bar. Search is debounced inside
 * the component — the parent hears about a term once typing pauses, never per
 * keystroke — and an external change to the committed term (Clear, a URL
 * change) must land in the input.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, StrictMode, useLayoutEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { setInputValue } from "../__testutils__/domEvents";
import ListFilterBar, { type ListFilterBarProps } from "./ListFilterBar";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SEARCH_LABEL = "Search widgets by name";

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

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const searchInput = () =>
  container.querySelector(`input[aria-label="${SEARCH_LABEL}"]`) as HTMLInputElement;
const clearButton = () =>
  container.querySelector('button[aria-label="Clear all filters"]') as HTMLButtonElement;

/** A parent that owns the committed search, like the real list pages do. */
function Harness(props: {
  onSearchChange: (v: string, reason?: string) => void;
  onFrom?: (v: string) => void;
  onTo?: (v: string) => void;
  onClear?: () => void;
  initialSearch?: string;
  expose?: (set: (v: string) => void) => void;
  extra?: Partial<ListFilterBarProps>;
}) {
  const [search, setSearch] = useState(props.initialSearch ?? "");
  props.expose?.(setSearch);
  return createElement(ListFilterBar, {
    search,
    onSearchChange: (v: string, reason: string) => { props.onSearchChange(v, reason); setSearch(v); },
    searchPlaceholder: "Name…",
    searchAriaLabel: SEARCH_LABEL,
    fromDate: "",
    toDate: "",
    onFromDateChange: props.onFrom ?? (() => {}),
    onToDateChange: props.onTo ?? (() => {}),
    dateAriaLabelPrefix: "Widget date",
    hasActiveFilters: search !== "",
    onClear: () => { props.onClear?.(); setSearch(""); },
    ...props.extra,
  });
}

async function render(el: ReturnType<typeof createElement>) {
  await act(async () => { root.render(el); });
}

describe("ListFilterBar (U-752)", () => {
  it("renders the shared markup, labels and aria-labels", async () => {
    await render(createElement(Harness, { onSearchChange: vi.fn() }));
    expect(container.querySelector(".list-filter-bar > .list-filter-row")).not.toBeNull();
    expect(searchInput().placeholder).toBe("Name…");
    expect(searchInput().type).toBe("search");
    expect(container.querySelector('input[aria-label="Widget date from"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="Widget date to"]')).not.toBeNull();
    const labels = Array.from(container.querySelectorAll(".list-filter-label")).map((l) => l.textContent);
    expect(labels).toEqual(["Search", "From", "To"]);
    expect(clearButton().textContent).toBe("Clear");
  });

  it("fires onSearchChange ONCE after typing pauses, never per keystroke", async () => {
    const onSearchChange = vi.fn();
    await render(createElement(Harness, { onSearchChange }));

    for (const v of ["a", "ab", "abc"]) {
      await act(async () => { setInputValue(searchInput(), v); });
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    // The input is responsive locally while the parent has heard nothing.
    expect(searchInput().value).toBe("abc");
    expect(onSearchChange).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("abc", "debounce");

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onSearchChange).toHaveBeenCalledTimes(1);
  });

  it("does not emit when the typed text returns to the committed term", async () => {
    const onSearchChange = vi.fn();
    await render(createElement(Harness, { onSearchChange, initialSearch: "acme" }));
    await act(async () => { setInputValue(searchInput(), "acmex"); });
    await act(async () => { setInputValue(searchInput(), "acme"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("fires the date callbacks immediately", async () => {
    const onFrom = vi.fn();
    const onTo = vi.fn();
    await render(createElement(Harness, { onSearchChange: vi.fn(), onFrom, onTo }));
    const from = container.querySelector('input[aria-label="Widget date from"]') as HTMLInputElement;
    const to = container.querySelector('input[aria-label="Widget date to"]') as HTMLInputElement;
    await act(async () => { setInputValue(from, "2026-01-01"); });
    expect(onFrom).toHaveBeenCalledWith("2026-01-01");
    await act(async () => { setInputValue(to, "2026-02-01"); });
    expect(onTo).toHaveBeenCalledWith("2026-02-01");
  });

  it("syncs the input when the committed term changes externally (URL / restore)", async () => {
    const onSearchChange = vi.fn();
    let setExternal: (v: string) => void = () => {};
    await render(createElement(Harness, { onSearchChange, expose: (s) => { setExternal = s; } }));

    await act(async () => { setExternal("from-url"); });
    expect(searchInput().value).toBe("from-url");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    // Adopting an external value is not an emit.
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("an external reset after a committed search stays reset — the stale term is never re-emitted", async () => {
    const onSearchChange = vi.fn();
    let setExternal: (v: string) => void = () => {};
    await render(createElement(Harness, { onSearchChange, expose: (s) => { setExternal = s; } }));

    await act(async () => { setInputValue(searchInput(), "abc"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(onSearchChange).toHaveBeenLastCalledWith("abc", "debounce");

    await act(async () => { setExternal(""); });
    expect(searchInput().value).toBe("");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(searchInput().value).toBe("");
    expect(onSearchChange).toHaveBeenCalledTimes(1);
  });

  it("Clear with ONLY uncommitted text clears the input locally and does not call onClear", async () => {
    const onSearchChange = vi.fn();
    const onClear = vi.fn();
    await render(createElement(Harness, { onSearchChange, onClear }));

    expect(clearButton().disabled).toBe(true);
    await act(async () => { setInputValue(searchInput(), "pend"); });
    // Typed-but-uncommitted text already enables Clear.
    expect(clearButton().disabled).toBe(false);

    await act(async () => { clearButton().click(); });
    expect(onClear).not.toHaveBeenCalled();
    expect(searchInput().value).toBe("");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(searchInput().value).toBe("");
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("Clear with a committed filter calls onClear, and an in-flight debounce does not resurrect the text", async () => {
    const onSearchChange = vi.fn();
    const onClear = vi.fn();
    await render(createElement(Harness, { onSearchChange, onClear, initialSearch: "acme" }));
    await act(async () => { setInputValue(searchInput(), "acmex"); });
    await act(async () => { clearButton().click(); });
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(searchInput().value).toBe("");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(searchInput().value).toBe("");
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("Enter flushes pending text at once, and the debounce does not emit it again", async () => {
    const onSearchChange = vi.fn();
    await render(createElement(Harness, { onSearchChange }));
    await act(async () => { setInputValue(searchInput(), "ent"); });
    await act(async () => {
      searchInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSearchChange).toHaveBeenCalledWith("ent", "enter");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onSearchChange).toHaveBeenCalledTimes(1);
  });

  it("blur flushes pending text at once; blur with nothing pending emits nothing", async () => {
    const onSearchChange = vi.fn();
    await render(createElement(Harness, { onSearchChange }));
    await act(async () => { searchInput().dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(onSearchChange).not.toHaveBeenCalled();
    await act(async () => { setInputValue(searchInput(), "bl"); });
    await act(async () => { searchInput().dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(onSearchChange).toHaveBeenCalledWith("bl", "blur");
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(onSearchChange).toHaveBeenCalledTimes(1);
  });

  it("unmount flushes pending text once, with reason 'unmount'", async () => {
    const onSearchChange = vi.fn();
    await render(createElement(Harness, { onSearchChange }));
    await act(async () => { setInputValue(searchInput(), "pending"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await render(createElement("div"));
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("pending", "unmount");
  });

  it("unmount emits nothing when nothing is pending, after Clear, or right after an external adoption", async () => {
    const onSearchChange = vi.fn();
    let setExternal: (v: string) => void = () => {};
    // Nothing pending.
    await render(createElement(Harness, { onSearchChange, initialSearch: "x" }));
    await render(createElement("div"));
    // After Clear.
    await render(createElement(Harness, { onSearchChange, initialSearch: "acme" }));
    await act(async () => { setInputValue(searchInput(), "acmex"); });
    await act(async () => { clearButton().click(); });
    await render(createElement("div"));
    // After an external adoption replaced pending text.
    await render(createElement(Harness, { onSearchChange, expose: (s) => { setExternal = s; } }));
    await act(async () => { setInputValue(searchInput(), "typed"); });
    await act(async () => { setExternal("from-url"); });
    await render(createElement("div"));
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("a blur fired while the input is being removed is an 'unmount' commit, emitted exactly once", async () => {
    // Chrome blurs a focused input as it is removed; React can still dispatch
    // onBlur in that deletion commit. Simulate it from a later sibling's layout
    // cleanup, which runs before the host nodes are removed.
    function BlurOnRemove() {
      useLayoutEffect(() => () => {
        fireRemovalBlur(container.querySelector(`input[aria-label="${SEARCH_LABEL}"]`));
      }, []);
      return null;
    }
    const onSearchChange = vi.fn();
    // A HOST wrapper, so the deletion root is one node: children's layout
    // cleanups run while the input is still in the DOM, as in a real removal.
    // (Unmount to a DIFFERENT element type, or React reuses the wrapper.)
    await render(createElement("section", null, createElement(Harness, { onSearchChange }), createElement(BlurOnRemove)));
    await act(async () => { setInputValue(searchInput(), "pending"); });
    await render(createElement("div"));
    expect(onSearchChange.mock.calls).toEqual([["pending", "unmount"]]);
  });

  it("mouse-down on Clear keeps focus in the input, so an uncommitted-only Clear commits nothing", async () => {
    const onSearchChange = vi.fn();
    const onClear = vi.fn();
    await render(createElement(Harness, { onSearchChange, onClear }));
    searchInput().focus();
    await act(async () => { setInputValue(searchInput(), "x"); });
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => {
      clearButton().dispatchEvent(down);
      // jsdom does not move focus on mouse-down; a browser does unless prevented.
      if (!down.defaultPrevented) clearButton().focus();
    });
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(searchInput());
    expect(onSearchChange).not.toHaveBeenCalled();
    await act(async () => { clearButton().click(); });
    expect(onSearchChange).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    expect(searchInput().value).toBe("");
  });

  it("StrictMode's simulated unmount/remount neither emits at mount nor double-emits", async () => {
    const onSearchChange = vi.fn();
    await render(createElement(StrictMode, null, createElement(Harness, { onSearchChange, initialSearch: "s" })));
    expect(onSearchChange).not.toHaveBeenCalled();
    await act(async () => { setInputValue(searchInput(), "s2"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    // The simulated unmount must not leave the component thinking it is
    // being removed: an ordinary blur afterwards is still a "blur".
    await act(async () => { setInputValue(searchInput(), "s3"); });
    await act(async () => { searchInput().dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(onSearchChange).toHaveBeenLastCalledWith("s3", "blur");
    await render(createElement("div"));
    expect(onSearchChange).toHaveBeenCalledTimes(2);
  });

  it("does not clobber text typed after an emit when the parent echoes the emitted value late", async () => {
    // A parent that echoes on a delay — the input must keep the newer text.
    const onSearchChange = vi.fn();
    function LagParent() {
      const [search, setSearch] = useState("");
      return createElement(ListFilterBar, {
        search,
        onSearchChange: (v: string) => { onSearchChange(v); window.setTimeout(() => setSearch(v), 200); },
        searchPlaceholder: "",
        searchAriaLabel: SEARCH_LABEL,
        fromDate: "",
        toDate: "",
        onFromDateChange: () => {},
        onToDateChange: () => {},
        dateAriaLabelPrefix: "Widget date",
        hasActiveFilters: search !== "",
        onClear: () => setSearch(""),
      });
    }
    await render(createElement(LagParent));
    await act(async () => { setInputValue(searchInput(), "ab"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(onSearchChange).toHaveBeenLastCalledWith("ab");
    await act(async () => { setInputValue(searchInput(), "abc"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); }); // echo of "ab" lands
    expect(searchInput().value).toBe("abc");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(onSearchChange).toHaveBeenLastCalledWith("abc");
  });

  it("renders extra children before the Clear button", async () => {
    await render(createElement(Harness, {
      onSearchChange: vi.fn(),
      extra: { children: createElement("span", { className: "extra-slot" }, "x") },
    }));
    const row = container.querySelector(".list-filter-row")!;
    const kids = Array.from(row.children);
    expect(kids.indexOf(row.querySelector(".extra-slot")!)).toBe(kids.length - 2);
  });
});
