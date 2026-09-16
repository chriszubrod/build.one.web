import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import RecordChangedBanner, { RECORD_CHANGED_CONFIRM } from "./RecordChangedBanner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * U-471 — Reload throws away unsaved work that cannot be saved (the banner
 * is shown only in that state). Confirm first; declining must not reload.
 */

let container: HTMLDivElement;
let root: Root;
let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reload = vi.fn();
  vi.stubGlobal("location", { reload });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderBanner() {
  act(() => {
    root.render(createElement(RecordChangedBanner, { entity: "bill" }));
  });
}

function clickReload() {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Reload",
  );
  expect(btn).toBeDefined();
  act(() => {
    btn!.click();
  });
}

describe("RecordChangedBanner", () => {
  it("says the record was changed in another window", () => {
    renderBanner();
    expect(container.textContent).toContain("This bill was changed in another window.");
  });

  it("does not reload when the confirm is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderBanner();
    clickReload();
    expect(window.confirm).toHaveBeenCalledWith(RECORD_CHANGED_CONFIRM);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads when the confirm is accepted", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderBanner();
    clickReload();
    expect(window.confirm).toHaveBeenCalledWith(RECORD_CHANGED_CONFIRM);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
