import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import Combobox from "./Combobox";
import { filterRankComboboxOptions } from "./comboboxFilter";
import {
  clearCombobox,
  comboboxInput,
  getComboboxValue,
  pickComboboxOptionByLabel,
  pickComboboxOptionByValue,
  tabAwayFromCombobox,
  typeInCombobox,
} from "../../test/combobox";
import { setInputValue } from "../../__testutils__/domEvents";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function visibleOptionLabels(): string[] {
  return Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).map((o) =>
    o.textContent?.trim(),
  );
}

function keyOnInput(input: HTMLInputElement, key: string): void {
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

describe("comboboxFilter", () => {
  const opts = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta One" },
    { value: "c", label: "Gamma" },
    { value: "d", label: "Zeta alpha" },
  ];

  it("ranks starts-with before word-start before contains with stable ties", () => {
    expect(filterRankComboboxOptions([{ value: "a", label: "Alpha" }], "al", 50).items).toHaveLength(
      1,
    );
    expect(filterRankComboboxOptions([{ value: "b", label: "Beta One" }], "be", 50).items).toHaveLength(
      1,
    );
    expect(filterRankComboboxOptions([{ value: "d", label: "Zeta alpha" }], "al", 50).items).toHaveLength(
      1,
    );
    expect(filterRankComboboxOptions([{ value: "c", label: "Gamma" }], "mm", 50).items).toHaveLength(
      1,
    );

    const { items } = filterRankComboboxOptions(opts, "al", 50);
    expect(items.map((o) => o.value)).toEqual(["a", "d"]);
  });

  it("matches SCC-style labels for numeric and word queries", () => {
    const scc = [{ value: "1", label: "21.00 Siding Material" }];
    expect(filterRankComboboxOptions(scc, "21", 50).items).toHaveLength(1);
    expect(filterRankComboboxOptions(scc, "21.00", 50).items).toHaveLength(1);
    expect(filterRankComboboxOptions(scc, "siding", 50).items).toHaveLength(1);
  });

  it("word-start matches after hyphenated tokens", () => {
    expect(
      filterRankComboboxOptions([{ value: "1", label: "Smith-Jones" }], "jon", 50).items,
    ).toHaveLength(1);
  });

  it("truncates and reports omitted count", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      value: String(i),
      label: `Item ${i}`,
    }));
    const { items, truncatedCount } = filterRankComboboxOptions(many, "", 50);
    expect(items).toHaveLength(50);
    expect(truncatedCount).toBe(10);
  });
});

describe("Combobox", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onChange = vi.fn();

  beforeEach(() => {
    onChange.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
  });

  function renderCombo(extra: Record<string, unknown> = {}) {
    act(() => {
      root.render(
        createElement(Combobox, {
          label: "Pick",
          name: "pick",
          id: "pick",
          options: [
            { value: "x", label: "X-Ray" },
            { value: "y", label: "Yellow" },
            { value: "z", label: "Zulu", disabled: true },
          ],
          value: "",
          onChange,
          ...extra,
        }),
      );
    });
  }

  it("selects with keyboard down+enter", () => {
    renderCombo();
    const input = comboboxInput(container);
    act(() => {
      typeInCombobox(container, "X");
    });
    act(() => {
      keyOnInput(input, "ArrowDown");
      keyOnInput(input, "Enter");
    });
    expect(onChange).toHaveBeenCalledWith("x");
    act(() => {
      root.render(
        createElement(Combobox, {
          label: "Pick",
          name: "pick",
          id: "pick",
          options: [
            { value: "x", label: "X-Ray" },
            { value: "y", label: "Yellow" },
            { value: "z", label: "Zulu", disabled: true },
          ],
          value: "x",
          onChange,
        }),
      );
    });
  });

  it("shows truncation hint row when filtered list exceeds maxResults", () => {
    const many = Array.from({ length: 55 }, (_, i) => ({
      value: String(i),
      label: `Vendor ${i}`,
    }));
    act(() => {
      root.render(
        createElement(Combobox, {
          ariaLabel: "V",
          variant: "inline",
          options: many,
          value: "",
          onChange,
        }),
      );
    });
    act(() => {
      typeInCombobox(container, "Vendor");
    });
    const hint = document.querySelector(".bo-combobox-truncated-hint");
    expect(hint?.textContent).toMatch(/Keep typing to narrow 5 more/);
  });

  it("Esc restores selected label after junk typing", () => {
    renderCombo({ value: "x" });
    const input = comboboxInput(container);
    act(() => {
      input.focus();
      setInputValue(input, "not-a-match");
    });
    expect(input.value).toBe("not-a-match");
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(input.value).toBe("X-Ray");
    expect(onChange).not.toHaveBeenCalled();
    expect(getComboboxValue(container)).toBe("x");
  });

  it("blur with junk text restores last selection without onChange", () => {
    renderCombo({ value: "y" });
    const input = comboboxInput(container);
    act(() => {
      input.focus();
      setInputValue(input, "junk");
      input.blur();
    });
    expect(input.value).toBe("Yellow");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("focus+blur emits nothing for set and empty values", () => {
    renderCombo({ value: "x" });
    act(() => tabAwayFromCombobox(container));
    expect(onChange).not.toHaveBeenCalled();

    onChange.mockReset();
    renderCombo({ value: "" });
    act(() => tabAwayFromCombobox(container));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("pick then blur emits exactly once", () => {
    renderCombo();
    act(() => {
      pickComboboxOptionByLabel(container, "X-Ray");
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("x");
    act(() => {
      root.render(
        createElement(Combobox, {
          label: "Pick",
          name: "pick",
          id: "pick",
          options: [
            { value: "x", label: "X-Ray" },
            { value: "y", label: "Yellow" },
            { value: "z", label: "Zulu", disabled: true },
          ],
          value: "x",
          onChange,
        }),
      );
    });
    act(() => tabAwayFromCombobox(container));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("tab away refocus pick emits exactly one onChange with frozen timers", () => {
    vi.useFakeTimers();
    renderCombo({ value: "x" });
    act(() => tabAwayFromCombobox(container));
    onChange.mockReset();
    act(() => {
      pickComboboxOptionByLabel(container, "Yellow");
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("y");
    vi.useRealTimers();
  });

  it("re-picking the current option emits nothing", () => {
    renderCombo({ value: "x" });
    act(() => {
      pickComboboxOptionByLabel(container, "X-Ray");
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("duplicate labels: blur never selects the wrong value", () => {
    act(() => {
      root.render(
        createElement(Combobox, {
          label: "Pick",
          options: [
            { value: "a", label: "Same" },
            { value: "b", label: "Same" },
          ],
          value: "b",
          onChange,
        }),
      );
    });
    const input = comboboxInput(container);
    act(() => {
      input.focus();
      setInputValue(input, "Same");
      input.blur();
    });
    expect(getComboboxValue(container)).toBe("b");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("typing a non-matching query then down+enter selects the first match not the old value", () => {
    act(() => {
      root.render(
        createElement(Combobox, {
          label: "Pick",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ],
          value: "a",
          onChange,
        }),
      );
    });
    const input = comboboxInput(container);
    act(() => {
      input.focus();
      setInputValue(input, "Be");
    });
    expect(input.value).toBe("Be");
    expect(visibleOptionLabels().some((l) => l?.startsWith("Beta"))).toBe(true);
    expect(visibleOptionLabels().some((l) => l === "Alpha")).toBe(false);
    act(() => {
      keyOnInput(input, "ArrowDown");
      keyOnInput(input, "Enter");
    });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("T1: typing after focus on a selected value keeps the draft (no synthetic focus reset)", () => {
    act(() => {
      root.render(
        createElement(Combobox, {
          label: "Pick",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ],
          value: "a",
          onChange,
        }),
      );
    });
    const input = comboboxInput(container);
    act(() => {
      input.focus();
      setInputValue(input, "AlphaB");
    });
    expect(input.value).toBe("AlphaB");
    expect(input.value).not.toBe("Alpha");
  });

  it("T2: filter then arrow down then continue typing keeps draft and selects filtered match", () => {
    act(() => {
      root.render(
        createElement(Combobox, {
          label: "Pick",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
            { value: "c", label: "Bear" },
          ],
          value: "",
          onChange,
        }),
      );
    });
    const input = comboboxInput(container);
    act(() => {
      input.focus();
      setInputValue(input, "Be");
    });
    act(() => {
      keyOnInput(input, "ArrowDown");
    });
    act(() => {
      setInputValue(input, "Bea");
    });
    expect(input.value).toBe("Bea");
    const shown = Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent);
    expect(shown).toEqual(["Bear"]);
    act(() => {
      keyOnInput(input, "ArrowDown");
    });
    act(() => {
      keyOnInput(input, "Enter");
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("external value change while focused updates input without onChange", () => {
    renderCombo({ value: "x" });
    const input = comboboxInput(container);
    act(() => {
      input.focus();
    });
    act(() => {
      root.render(
        createElement(Combobox, {
          label: "Pick",
          options: [
            { value: "x", label: "X-Ray" },
            { value: "y", label: "Yellow" },
          ],
          value: "y",
          onChange,
        }),
      );
    });
    expect(comboboxInput(container).value).toBe("Yellow");
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      comboboxInput(container).blur();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('form variant does not list "Select..." as a pickable option', () => {
    renderCombo({ value: "" });
    act(() => {
      (container.querySelector(".bo-combobox-trigger") as HTMLButtonElement)?.click();
    });
    const labels = Array.from(document.querySelectorAll('[role="option"]')).map((o) =>
      o.textContent?.trim(),
    );
    expect(labels).not.toContain("Select...");
  });

  it("clears when not required", () => {
    renderCombo({ value: "x" });
    act(() => {
      clearCombobox(container);
    });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("required restores selection when cleared via empty blur", () => {
    renderCombo({ value: "x", required: true });
    const input = comboboxInput(container);
    act(() => {
      input.focus();
      setInputValue(input, "");
      input.blur();
    });
    expect(onChange).not.toHaveBeenCalledWith("");
    expect(input.value).toBe("X-Ray");
  });

  it("does not select disabled options", () => {
    renderCombo();
    act(() => {
      pickComboboxOptionByLabel(container, "Zulu");
    });
    expect(onChange).not.toHaveBeenCalledWith("z");
  });

  it("reflects external value changes", () => {
    renderCombo({ value: "" });
    act(() => {
      root.render(
        createElement(Combobox, {
          label: "Pick",
          options: [
            { value: "x", label: "X-Ray" },
            { value: "y", label: "Yellow" },
          ],
          value: "y",
          onChange,
        }),
      );
    });
    expect(comboboxInput(container).value).toBe("Yellow");
  });

  it("Enter inside a form selects and does not submit the form", () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    container.innerHTML = "";
    act(() => root.unmount());
    const wrap = document.createElement("div");
    document.body.appendChild(wrap);
    const formRoot = createRoot(wrap);
    act(() => {
      formRoot.render(
        createElement(
          "form",
          {
            onSubmit,
          },
          createElement(Combobox, {
            label: "Pick",
            name: "pick",
            options: [{ value: "x", label: "X-Ray" }],
            value: "",
            onChange,
          }),
          createElement("button", { type: "submit" }, "Save"),
        ),
      );
    });
    act(() => {
      pickComboboxOptionByValue(wrap, "x");
    });
    expect(onSubmit).not.toHaveBeenCalled();
    formRoot.unmount();
    document.body.removeChild(wrap);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
});
