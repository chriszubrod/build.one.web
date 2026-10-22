import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EntryCard from "./EntryCard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function renderCard(props: ComponentProps<typeof EntryCard>) {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/start"] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/start",
            element: createElement(EntryCard, props),
          }),
          createElement(Route, {
            path: "/target",
            element: createElement("div", { "data-testid": "target-page" }, "Target"),
          }),
        ),
      ),
    );
  });
}

const baseProps = {
  projectAbbrev: "PRJ",
  projectName: "Project Alpha",
  meta: "meta line",
  duration: "1h",
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
});

describe("EntryCard", () => {
  it("with to, renders an anchor with the correct href", () => {
    renderCard({ ...baseProps, to: "/bill/b-1/edit" });
    const link = container.querySelector("a.entry-card");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toBe("/bill/b-1/edit");
  });

  it("with to, a plain click navigates in-app", async () => {
    renderCard({ ...baseProps, to: "/target" });
    const link = container.querySelector("a.entry-card") as HTMLAnchorElement;
    await act(async () => {
      link.click();
    });
    expect(container.querySelector('[data-testid="target-page"]')).toBeTruthy();
  });

  it("with to, Cmd/Ctrl-click does not navigate in-app", async () => {
    renderCard({ ...baseProps, to: "/target" });
    const link = container.querySelector("a.entry-card") as HTMLAnchorElement;
    for (const modifier of ["metaKey", "ctrlKey"] as const) {
      await act(async () => {
        link.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, [modifier]: true }),
        );
      });
      expect(container.querySelector('[data-testid="target-page"]')).toBeNull();
    }
  });

  it("without to and with onClick, renders a button like before", async () => {
    const onClick = vi.fn();
    renderCard({ ...baseProps, onClick });
    const btn = container.querySelector("button.entry-card");
    expect(btn).toBeTruthy();
    expect(container.querySelector("a.entry-card")).toBeNull();
    await act(async () => {
      (btn as HTMLButtonElement).click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
