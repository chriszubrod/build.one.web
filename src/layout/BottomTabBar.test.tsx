import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import BottomTabBar from "./BottomTabBar";
import { Modules } from "../shared/modules";
import type { CurrentUser, CurrentUserModule } from "../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockUseCurrentUser = vi.fn();

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

function makeModule(
  name: string,
  perms: Partial<CurrentUserModule> = {},
): CurrentUserModule {
  return {
    public_id: `mod-${name}`,
    name,
    route: null,
    can_read: false,
    can_create: false,
    can_update: false,
    can_delete: false,
    can_submit: false,
    can_approve: false,
    can_complete: false,
    can_view_team: false,
    ...perms,
  } as CurrentUserModule;
}

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

describe("BottomTabBar", () => {
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

  function renderTabBar() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(BottomTabBar),
          ),
        ),
      );
    });
  }

  function moreButton(): HTMLButtonElement | null {
    const tabbar = document.querySelector(".app-tabbar");
    if (!tabbar) return null;
    return (
      Array.from(tabbar.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("More"),
      ) ?? null
    );
  }

  it("system admin renders a More button with aria-expanded=false", () => {
    mockUseCurrentUser.mockReturnValue({
      data: makeUser({ is_admin: true, modules: [] }),
    });
    renderTabBar();

    const btn = moreButton();
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute("aria-expanded")).toBe("false");
  });

  it("Field Crew with only Time Tracking can_read renders no More button", () => {
    mockUseCurrentUser.mockReturnValue({
      data: makeUser({
        role: "Field Crew",
        modules: [makeModule(Modules.TIME_TRACKING, { can_read: true })],
      }),
    });
    renderTabBar();

    expect(document.querySelector(".app-tabbar button")).toBeNull();
  });

  it("system admin opening More exposes Vendors and Customers links", () => {
    mockUseCurrentUser.mockReturnValue({
      data: makeUser({ is_admin: true, modules: [] }),
    });
    renderTabBar();

    const btn = moreButton();
    expect(btn).not.toBeNull();

    act(() => {
      btn!.click();
    });

    expect(btn!.getAttribute("aria-expanded")).toBe("true");

    const vendorLink = document.querySelector('a[href="/vendor/list"]');
    const customerLink = document.querySelector('a[href="/customer/list"]');
    expect(vendorLink).not.toBeNull();
    expect(customerLink).not.toBeNull();
  });

  it("sheet backdrop is not a descendant of .app-tabbar when drawer is open", () => {
    // .app-tabbar has transform: translateX(-50%), and a transformed ancestor
    // becomes the containing block for position:fixed descendants — mounting the
    // sheet inside the pill would clip it to the pill instead of the viewport.
    // jsdom cannot evaluate the CSS, but the DOM-tree relationship is exactly
    // what pins the fix.
    mockUseCurrentUser.mockReturnValue({
      data: makeUser({ is_admin: true, modules: [] }),
    });
    renderTabBar();

    act(() => {
      moreButton()!.click();
    });

    expect(document.querySelector(".app-tabbar .sheet-backdrop")).toBeNull();
    expect(document.querySelector(".sheet-backdrop")).not.toBeNull();
  });

  it("system admin shows /profile at most once across tabbar and open drawer", () => {
    mockUseCurrentUser.mockReturnValue({
      data: makeUser({ is_admin: true, modules: [] }),
    });
    renderTabBar();

    act(() => {
      moreButton()!.click();
    });

    // Exactly 1, not <=1: profile is a primary slot for every role, so it must
    // render on the pill AND be excluded from the drawer. <=1 would pass
    // vacuously if the entry vanished from both.
    const profileLinks = document.querySelectorAll('a[href="/profile"]');
    expect(profileLinks.length).toBe(1);
  });
});
