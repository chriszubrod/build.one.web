import { describe, it, expect, vi, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import EntryCard from "./EntryCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function mount(props: { onClick?: () => void; onPrefetch?: () => void }) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(EntryCard, {
        projectAbbrev: "ACM",
        projectName: "Acme Supply",
        meta: "EXP-1",
        duration: "$10.00",
        ...props,
      }),
    );
  });
  return container.querySelector("button.entry-card") as HTMLButtonElement | null;
}

describe("EntryCard onPrefetch", () => {
  it("fires on hover, keyboard focus and touch-start — before any click", () => {
    const onPrefetch = vi.fn();
    const onClick = vi.fn();
    const button = mount({ onClick, onPrefetch });
    expect(button).not.toBeNull();

    act(() => { button!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
    act(() => { button!.focus(); });
    act(() => { button!.dispatchEvent(new Event("touchstart", { bubbles: true })); });

    expect(onPrefetch).toHaveBeenCalledTimes(3);
    expect(onClick).not.toHaveBeenCalled();

    act(() => { button!.click(); });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a plain card with no prefetch wiring when there is no onClick", () => {
    const onPrefetch = vi.fn();
    const button = mount({ onPrefetch });
    expect(button).toBeNull();
    expect(container!.querySelector(".entry-card")).not.toBeNull();
  });
});
