import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import type { CurrentUser, CurrentUserModule } from "../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseCurrentUser = vi.fn();

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

function makeUser(opts: {
  role?: string | null;
  is_admin?: boolean;
  modules?: CurrentUserModule[];
}): CurrentUser {
  return {
    auth: { public_id: "auth-id", username: "test" },
    user: {
      id: 1,
      public_id: "user-id",
      firstname: "Test",
      lastname: "User",
    },
    role: opts.role !== null && opts.role !== undefined ? { public_id: "role-id", name: opts.role } : null,
    is_admin: opts.is_admin ?? false,
    modules: opts.modules ?? [],
    accessible_project_ids: [],
  };
}

describe("AppSidebar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
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

  function renderSidebar(initialPath?: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          initialPath ? { initialEntries: [initialPath] } : null,
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(AppSidebar),
          ),
        ),
      );
    });
  }

  it("a detail route lights its parent primary sidebar link", () => {
    mockUseCurrentUser.mockReturnValue({
      data: makeUser({ is_admin: true, modules: [] }),
    });
    renderSidebar("/project/123");

    const sidebar = document.querySelector(".app-sidebar")!;

    const projectLink = sidebar.querySelector('a[href="/project/list"]')!;
    expect(projectLink.classList.contains("app-sidebar-link-active")).toBe(true);
    expect(projectLink.getAttribute("aria-current")).toBe("page");

    const timeLink = sidebar.querySelector('a[href="/time-entry/list"]')!;
    expect(timeLink.classList.contains("app-sidebar-link-active")).toBe(false);
    expect(timeLink.getAttribute("aria-current")).toBeNull();
  });
});
