import { describe, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "./ErrorBoundary";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Boom(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("shows fallback when a child throws", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(ErrorBoundary, null, createElement(Boom)));
    });

    expect(container.textContent).toContain("Something went wrong");
    expect(container.querySelector("button")?.textContent).toBe("Reload");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ErrorBoundary] Uncaught render error:",
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    consoleErrorSpy.mockRestore();
  });

  it("renders children when no error", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(createElement(ErrorBoundary, null, createElement("div", null, "healthy")));
    });

    expect(container.textContent).toContain("healthy");
    expect(container.textContent).not.toContain("Something went wrong");

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
