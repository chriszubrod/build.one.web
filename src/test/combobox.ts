import { act } from "react";
import { flushSync } from "react-dom";
import { vi } from "vitest";
import { setInputValue } from "../__testutils__/domEvents";

function tryResolveComboboxRoot(root: ParentNode): Element | null {
  try {
    return resolveComboboxRoot(root);
  } catch {
    return null;
  }
}

function isLazyComboboxLoaded(box: Element): boolean {
  if (box.hasAttribute("data-bo-combobox-pending")) return false;
  const input = box.querySelector('input:not([type="hidden"])') as HTMLInputElement | null;
  return Boolean(input);
}

function ensureComboboxReadySync(root: ParentNode): Element {
  for (let i = 0; i < 50; i++) {
    flushSync(() => {});
    if (vi.isFakeTimers()) {
      vi.advanceTimersByTime(0);
    }
    const box = tryResolveComboboxRoot(root);
    if (box && isLazyComboboxLoaded(box)) {
      return box;
    }
  }
  throw new Error("combobox did not finish loading (LazyCombobox pending)");
}

/** Wait for {@link LazyCombobox} to swap off its loading fallback. */
export async function waitForCombobox(root: ParentNode): Promise<void> {
  let loaded = false;
  await act(async () => {
    for (let i = 0; i < 100; i++) {
      if (vi.isFakeTimers()) {
        await vi.advanceTimersByTimeAsync(10);
      } else {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      }
      const box = tryResolveComboboxRoot(root);
      if (box && isLazyComboboxLoaded(box)) {
        loaded = true;
        return;
      }
    }
  });
  if (!loaded) {
    ensureComboboxReadySync(root);
  }
  const box = tryResolveComboboxRoot(root);
  if (!box || !isLazyComboboxLoaded(box)) {
    throw new Error("combobox did not finish loading (LazyCombobox pending)");
  }
}

/** Wait until every LazyCombobox under `scope` has swapped to the real control. */
export async function waitForAllComboboxes(scope: ParentNode): Promise<void> {
  const element =
    scope instanceof Document
      ? scope.documentElement
      : scope instanceof Element
        ? scope
        : null;
  if (!element) {
    throw new Error("waitForAllComboboxes: expected Element or Document");
  }
  for (let round = 0; round < 50; round++) {
    const boxes = element.querySelectorAll(".bo-combobox");
    if (boxes.length === 0) {
      await act(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      continue;
    }
    const pending = element.querySelectorAll("[data-bo-combobox-pending]");
    if (pending.length > 0) {
      await act(async () => {
        for (const box of pending) {
          await waitForCombobox(box);
        }
      });
      continue;
    }
    let allLoaded = true;
    for (const box of boxes) {
      if (!isLazyComboboxLoaded(box)) allLoaded = false;
    }
    if (allLoaded) return;
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    });
  }
  throw new Error("comboboxes did not finish loading (LazyCombobox pending)");
}

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

function liveComboboxByField(field: string): Element | null {
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(field)
      : field.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  return document.querySelector(`[data-bo-field="${escaped}"]`);
}

function resolveComboboxRoot(root: ParentNode): Element {
  if (root instanceof Element && root.classList.contains("bo-combobox")) {
    const field = root.getAttribute("data-bo-field");
    if (field) {
      const live = liveComboboxByField(field);
      if (live) return live;
    }
    return root;
  }
  if (root instanceof Element && root.hasAttribute("data-bo-field")) {
    const field = root.getAttribute("data-bo-field")!;
    const live = liveComboboxByField(field);
    return live ?? root;
  }
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
  const box = ensureComboboxReadySync(root);
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
  const box = ensureComboboxReadySync(root);
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
  const box = ensureComboboxReadySync(root);
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
  const box = ensureComboboxReadySync(root);
  openComboboxList(box);
  flushSync(() => {
    setInputValue(comboboxInput(box), text);
  });
}

/** Focus then tab away (or blur) without changing the value. Wrap in `act()`. */
export function tabAwayFromCombobox(root: ParentNode): void {
  const box = ensureComboboxReadySync(root);
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
