import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import LazyCombobox, { __testComboboxDynamicImportCount } from "./LazyCombobox";
import { pickComboboxOptionByLabel, waitForCombobox } from "../../test/combobox";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("LazyCombobox", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it("shows fallback with the selected label and does not call onChange on first paint", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        createElement(LazyCombobox, {
          label: "Pick",
          name: "pick",
          value: "a",
          onChange,
          options: OPTIONS,
        }),
      );
    });
    const pending = container.querySelector("[data-bo-combobox-pending]");
    expect(pending).toBeTruthy();
    const input = container.querySelector('input:not([type="hidden"])') as HTMLInputElement;
    expect(input.value).toBe("Alpha");
    expect(input.readOnly).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("replaces fallback with the real combobox without onChange", async () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        createElement(LazyCombobox, {
          label: "Pick",
          name: "pick",
          value: "a",
          onChange,
          options: OPTIONS,
        }),
      );
    });
    await waitForCombobox(container);
    expect(container.querySelector("[data-bo-combobox-pending]")).toBeNull();
    const input = container.querySelector('input:not([type="hidden"])') as HTMLInputElement;
    expect(input.value).toBe("Alpha");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange once after picking post-load", async () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        createElement(LazyCombobox, {
          label: "Pick",
          name: "pick",
          value: "a",
          onChange,
          options: OPTIONS,
        }),
      );
    });
    await waitForCombobox(container);
    await act(async () => {
      pickComboboxOptionByLabel(container, "Beta");
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("loads Combobox once when many instances mount", async () => {
    const importsBefore = __testComboboxDynamicImportCount();

    act(() => {
      root.render(
        createElement(
          "div",
          null,
          ...Array.from({ length: 10 }, (_, i) =>
            createElement(LazyCombobox, {
              key: i,
              label: `Pick ${i}`,
              name: `pick-${i}`,
              value: "",
              onChange: () => {},
              options: OPTIONS,
            }),
          ),
        ),
      );
    });

    await waitForCombobox(container);

    expect(__testComboboxDynamicImportCount()).toBe(importsBefore);
    expect(importsBefore).toBeGreaterThanOrEqual(1);
  });
});
