import { flushSync } from "react-dom";
import { vi } from "vitest";
import { setInputValue } from "../__testutils__/domEvents";

/** Current selected value (`""` when cleared). */
export function getComboboxValue(root: ParentNode): string {
  const box = resolveComboboxRoot(root);
  return box.getAttribute("data-bo-combobox-value") ?? "";
}

export function comboboxInput(root: ParentNode): HTMLInputElement {
  const box = resolveComboboxRoot(root);
  const input = box.querySelector('input:not([type="hidden"])') as HTMLInputElement | null;
  if (!input) throw new Error("combobox input not found");
  return input;
}

function resolveComboboxRoot(root: ParentNode): Element {
  if (root instanceof Element && root.classList.contains("bo-combobox")) return root;
  if (root instanceof Element && root.hasAttribute("data-bo-field")) return root;
  const box =
    (root instanceof Element ? root.querySelector(".bo-combobox") : null) ??
    (root instanceof Document || root instanceof Element
      ? root.querySelector("[data-bo-field].bo-combobox, [data-bo-field] .bo-combobox")
      : null);
  if (!box) throw new Error("combobox root not found");
  return box;
}

function openComboboxList(box: Element): void {
  const input = comboboxInput(box);
  flushSync(() => {
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
  });
  if (vi.isFakeTimers()) {
    vi.advanceTimersByTime(0);
  }
}

function listboxOptions(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')) as HTMLElement[];
}

function listboxOptionsFor(box: Element): HTMLElement[] {
  const input = comboboxInput(box);
  const controls = input.getAttribute("aria-controls");
  if (controls) {
    const list = document.getElementById(controls);
    if (list) {
      return Array.from(list.querySelectorAll('[role="option"]')) as HTMLElement[];
    }
  }
  return listboxOptions();
}

function findOptionByValue(value: string, box: Element): HTMLElement | undefined {
  return listboxOptionsFor(box).find((el) => {
    if (el.getAttribute("data-key") === value) return true;
    if (el.id === value) return true;
    const id = el.id ?? "";
    if (id.endsWith(`-option-${value}`) || id.endsWith(`-${value}`)) return true;
    return false;
  });
}

/** Pick an option by its value key (same strings `<select>` values used). Wrap in `act()` like {@link setSelectValue}. */
export function pickComboboxOptionByValue(root: ParentNode, value: string): void {
  const box = resolveComboboxRoot(root);
  openComboboxList(box);
  let option = findOptionByValue(value, box);
  if (!option) {
    setInputValue(comboboxInput(box), value);
    option = findOptionByValue(value, box);
  }
  if (!option) {
    const opts = listboxOptionsFor(box);
    const labels = opts.map((o) => o.textContent?.trim()).join(", ");
    throw new Error(
      `combobox option with value ${JSON.stringify(value)} not found (${opts.length} options: ${labels})`,
    );
  }
  flushSync(() => {
    option.click();
  });
}

/** Pick an option by visible label text. Wrap in `act()` like {@link setSelectValue}. */
export function pickComboboxOptionByLabel(root: ParentNode, label: string): void {
  const box = resolveComboboxRoot(root);
  openComboboxList(box);
  const option = listboxOptionsFor(box).find((el) => el.textContent?.trim() === label);
  if (!option) {
    const opts = listboxOptionsFor(box);
    throw new Error(
      `combobox option with label ${JSON.stringify(label)} not found (${opts.length} options)`,
    );
  }
  flushSync(() => {
    option.click();
  });
}

/** Clear a non-required combobox (× button). Wrap in `act()`. */
export function clearCombobox(root: ParentNode): void {
  const box = resolveComboboxRoot(root);
  const clearBtn = box.querySelector(".bo-combobox-clear") as HTMLButtonElement | null;
  if (clearBtn) {
    clearBtn.click();
    return;
  }
  throw new Error(
    "clearCombobox: no × button (required or empty) — use pickComboboxOptionByValue or tabAwayFromCombobox",
  );
}

/** Type into the combobox filter input (opens the list). Wrap in `act()`. */
export function typeInCombobox(root: ParentNode, text: string): void {
  const box = resolveComboboxRoot(root);
  openComboboxList(box);
  flushSync(() => {
    setInputValue(comboboxInput(box), text);
  });
}

/** Focus then tab away (or blur) without changing the value. Wrap in `act()`. */
export function tabAwayFromCombobox(root: ParentNode): void {
  const box = resolveComboboxRoot(root);
  const input = comboboxInput(box);
  flushSync(() => {
    input.focus();
  });
  flushSync(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    input.blur();
  });
  if (vi.isFakeTimers()) {
    vi.advanceTimersByTime(0);
  }
}
