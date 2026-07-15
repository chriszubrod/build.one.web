import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

// React 19 requires this global for act() to run without warnings. Setting it
// here means every spec that imports this harness inherits it for free.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export type Deferred<T = void> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (error: unknown) => void;
};

// A promise plus its resolve/reject, so a test can settle it by hand. Defaults
// to Deferred<void> so `deferred()` / `Deferred[]` read the same as before.
export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Drain queued promise microtasks (the do/while continuations). Microtasks are
// NOT faked by vi.useFakeTimers(), so real awaits advance the loop under test.
export async function drain(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

// Minimal renderHook harness — no @testing-library/react dependency. Renders a
// bare component whose only job is to invoke useHook() and expose its latest
// return value via result.current.
export function renderHook<T>(useHook: () => T) {
  const container = document.createElement("div");
  const root = createRoot(container);
  const result = { current: undefined as unknown as T };

  function TestComponent() {
    result.current = useHook();
    return null;
  }

  act(() => {
    root.render(createElement(TestComponent));
  });

  return {
    result,
    rerender: () => {
      act(() => {
        root.render(createElement(TestComponent));
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}
