import { describe, it, expect, afterEach, beforeEach } from "vitest";
import {
  act,
  createElement,
  Fragment,
  StrictMode,
  Suspense,
  startTransition,
  useState,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import Sheet, { FOCUSABLE } from "./Sheet";
import SheetHeader from "./SheetHeader";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const never = new Promise<never>(() => {});

const registeredTriggers: HTMLButtonElement[] = [];

function addTrigger(id?: string): HTMLButtonElement {
  const trigger = document.createElement("button");
  trigger.type = "button";
  if (id) trigger.id = id;
  trigger.textContent = "Open";
  document.body.appendChild(trigger);
  registeredTriggers.push(trigger);
  return trigger;
}

function focusTrigger(el: HTMLElement): void {
  act(() => {
    el.focus();
  });
  expect(document.activeElement).toBe(el);
}

function header(title: string) {
  return createElement(SheetHeader, {
    title,
    onCancel: () => {},
  });
}

function MaybeSuspend({ suspend }: { suspend: boolean }): ReactNode {
  if (suspend) throw never;
  return null;
}

describe("Sheet", () => {
  let container: HTMLDivElement;
  let root: Root;

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
    for (const trigger of registeredTriggers.splice(0)) {
      if (trigger.parentNode) trigger.parentNode.removeChild(trigger);
    }
  });

  function renderSheet({
    open = true,
    id,
    children,
  }: {
    open?: boolean;
    id?: string;
    children: ReactNode;
  }) {
    act(() => {
      root.render(
        createElement(Sheet, {
          open,
          id,
          onDismiss: () => {},
          children,
        }),
      );
    });
  }

  function openSheet(...children: ReactNode[]) {
    renderSheet({
      children: createElement(Fragment, null, ...children),
    });
  }

  it("renders dialog semantics and aria-labelledby points at the title", () => {
    openSheet(header("Test Title"));

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
    expect(dialog!.id).not.toBe("");

    const labelledBy = dialog!.getAttribute("aria-labelledby");
    expect(labelledBy).not.toBeNull();

    const titleEl = document.getElementById(labelledBy!);
    expect(titleEl).not.toBeNull();
    expect(titleEl!.textContent).toBe("Test Title");
  });

  it("focuses the dialog card when no child has autoFocus", () => {
    openSheet(header("No AutoFocus"), createElement("input", { type: "text" }));

    const dialog = document.querySelector('[role="dialog"]');
    expect(document.activeElement).toBe(dialog);
  });

  it("yields focus to a child input with autoFocus", () => {
    openSheet(
      header("Picker"),
      createElement("input", { type: "text", autoFocus: true }),
    );

    const dialog = document.querySelector('[role="dialog"]');
    const input = dialog!.querySelector("input");
    const cancel = dialog!.querySelector("button");

    expect(document.activeElement).toBe(input);
    expect(document.activeElement).not.toBe(dialog);
    expect(document.activeElement).not.toBe(cancel);
  });

  it.each([
    {
      name: "wraps Tab forward from the last focusable to the first",
      shiftKey: false,
      focusTarget: "last" as const,
      expectedTarget: "first" as const,
    },
    {
      name: "wraps Shift+Tab from the first focusable to the last",
      shiftKey: true,
      focusTarget: "first" as const,
      expectedTarget: "last" as const,
    },
  ])("$name", ({ shiftKey, focusTarget, expectedTarget }) => {
    openSheet(
      createElement(SheetHeader, {
        title: "Trap",
        onCancel: () => {},
        onSave: () => {},
      }),
      createElement("input", { type: "text" }),
    );

    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const focusEl = focusTarget === "first" ? first : last;
    const expectEl = expectedTarget === "first" ? first : last;

    act(() => {
      focusEl.focus();
    });
    expect(document.activeElement).toBe(focusEl);

    act(() => {
      focusEl.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey,
          bubbles: true,
        }),
      );
    });

    expect(document.activeElement).toBe(expectEl);
  });

  it.each([
    {
      name: "restores focus to the trigger even when a child has autoFocus",
      autoFocus: true,
      close: "rerender" as const,
    },
    {
      name: "restores focus to the trigger on unmount even when a child has autoFocus",
      autoFocus: true,
      close: "unmount" as const,
    },
    {
      name: "restores focus to the trigger when the sheet closes",
      autoFocus: false,
      close: "rerender" as const,
    },
    {
      name: "restores focus to the trigger when the sheet unmounts while open",
      autoFocus: false,
      close: "unmount" as const,
    },
  ])("$name", ({ autoFocus, close }) => {
    const trigger = addTrigger();

    focusTrigger(trigger);

    const sheetChildren = createElement(
      Fragment,
      null,
      header(autoFocus ? "AutoFocus picker" : "Close me"),
      ...(autoFocus ? [createElement("input", { type: "text", autoFocus: true })] : []),
    );

    renderSheet({ children: sheetChildren });

    if (autoFocus) {
      const input = document.querySelector('[role="dialog"] input');
      expect(document.activeElement).toBe(input);
    }

    if (close === "rerender") {
      renderSheet({ open: false, children: sheetChildren });
    } else {
      act(() => {
        root.unmount();
      });
    }

    expect(document.activeElement).toBe(trigger);
  });

  it("the dialog carries the caller-supplied id", () => {
    renderSheet({
      id: "test-sheet-id",
      children: header("Id test"),
    });

    const dialog = document.getElementById("test-sheet-id");
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("role")).toBe("dialog");
  });

  it("re-captures the trigger per open (a stale trigger is never restored)", () => {
    const triggerA = addTrigger();
    triggerA.textContent = "Open A";

    const triggerB = addTrigger();
    triggerB.textContent = "Open B";

    const sheetProps = {
      onDismiss: () => {},
      children: header("Recapture"),
    };

    focusTrigger(triggerA);

    act(() => {
      root.render(createElement(Sheet, { ...sheetProps, open: true }));
    });

    act(() => {
      root.render(createElement(Sheet, { ...sheetProps, open: false }));
    });
    expect(document.activeElement).toBe(triggerA);

    focusTrigger(triggerB);

    act(() => {
      root.render(createElement(Sheet, { ...sheetProps, open: true }));
    });

    act(() => {
      root.render(createElement(Sheet, { ...sheetProps, open: false }));
    });
    expect(document.activeElement).toBe(triggerB);
    expect(document.activeElement).not.toBe(triggerA);
  });

  // Pins the cardRef.current === null capture gate: a render-phase wasOpen
  // flag would survive a discarded (suspended) open render and restore focus
  // to a stale trigger instead of the real opener.
  it("recaptures the trigger after a discarded (suspended) open render", async () => {
    const triggerA = addTrigger("A");

    const triggerB = addTrigger("B");

    let setState: (s: { open: boolean; suspend: boolean }) => void = () => {};

    function App() {
      const [s, set] = useState({ open: false, suspend: false });
      setState = set;
      return createElement(
        Suspense,
        { fallback: createElement("div", null, "fb") },
        createElement(Sheet, {
          open: s.open,
          onDismiss: () => {},
          children: createElement(
            Fragment,
            null,
            createElement(SheetHeader, { title: "P", onCancel: () => {} }),
          ),
        }),
        createElement(MaybeSuspend, { suspend: s.suspend }),
      );
    }

    await act(async () => {
      root.render(createElement(App));
    });

    focusTrigger(triggerA);
    await act(async () => {
      startTransition(() => setState({ open: true, suspend: true }));
    });

    focusTrigger(triggerB);
    await act(async () => {
      setState({ open: true, suspend: false });
    });

    await act(async () => {
      setState({ open: false, suspend: false });
    });
    expect((document.activeElement as HTMLElement).id).toBe("B");
  });

  // Pins the StrictMode-replay guard: mount-open under dev StrictMode must not
  // treat effect cleanup as a real close (autoFocus survives; trigger restores).
  it("mounted already-open under StrictMode: keeps autoFocus and still restores to the trigger", () => {
    const trigger = addTrigger("T");
    focusTrigger(trigger);
    const tree = (open: boolean) =>
      createElement(
        StrictMode,
        null,
        open
          ? createElement(Sheet, {
              open: true,
              onDismiss: () => {},
              children: createElement(
                Fragment,
                null,
                createElement(SheetHeader, { title: "P", onCancel: () => {} }),
                createElement("input", { id: "IN", type: "text", autoFocus: true }),
              ),
            })
          : null,
      );
    act(() => root.render(tree(true)));
    expect((document.activeElement as HTMLElement).id).toBe("IN");
    act(() => root.render(tree(false)));
    expect((document.activeElement as HTMLElement).id).toBe("T");
  });

  it("does not steal focus when rendered with open={false}", () => {
    const outside = addTrigger();
    outside.textContent = "Outside";

    focusTrigger(outside);

    renderSheet({
      open: false,
      children: header("Hidden"),
    });

    expect(document.activeElement).toBe(outside);
  });
});
