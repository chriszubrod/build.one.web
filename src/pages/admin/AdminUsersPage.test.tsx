import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminUsersPage from "./AdminUsersPage";
import { ADMIN_USERS_PAGE_SIZE } from "./adminApi";
import type { AdminUserSummary } from "../../types/api";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue } from "../../__testutils__/domEvents";
import { makeUser } from "../../__testutils__/currentUser";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockListAdminUsers = vi.fn();

vi.mock("./adminApi", () => ({
  ADMIN_USERS_PAGE_SIZE: 50,
  listAdminUsers: (...args: unknown[]) => mockListAdminUsers(...args),
}));

const mockUseCurrentUser = vi.fn(() => ({
  data: makeUser(true),
  isLoading: false,
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

function sampleUser(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    public_id: "user-pub-1",
    id: 1,
    firstname: "Ada",
    lastname: "Lovelace",
    is_system_admin: false,
    is_agent: false,
    username: "ada",
    has_auth: true,
    email: "ada@example.com",
    roles: [],
    created_datetime: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root | null = null;
let queryClient: QueryClient;

function renderPage(initialPath = "/admin") {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          { initialEntries: [initialPath] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/admin", element: createElement(AdminUsersPage) }),
            createElement(Route, {
              path: "/profile",
              element: createElement("div", { "data-testid": "profile-landed" }, "Profile"),
            }),
          ),
        ),
      ),
    );
  });
}

beforeEach(() => {
  // flushUntil advances FAKE timers — the house precondition (src/__testutils__/flush.ts).
  vi.useFakeTimers();
  mockListAdminUsers.mockReset();
  mockListAdminUsers.mockResolvedValue({ data: [], count: 0 });
  mockUseCurrentUser.mockReset();
  mockUseCurrentUser.mockReturnValue({ data: makeUser(true), isLoading: false });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  vi.useRealTimers();
});

describe("AdminUsersPage", () => {
  it("redirects non-admins to /profile without calling listAdminUsers", async () => {
    mockUseCurrentUser.mockReturnValue({ data: makeUser(false), isLoading: false });
    renderPage();
    await flushUntil(() => container.querySelector("[data-testid='profile-landed']") != null);
    expect(container.querySelector("[data-testid='profile-landed']")).not.toBeNull();
    expect(mockListAdminUsers).not.toHaveBeenCalled();
  });

  it("renders admin user rows and requests list with search/limit/offset", async () => {
    mockListAdminUsers.mockResolvedValue({
      data: [
        sampleUser({
          public_id: "u-admin",
          firstname: "Sys",
          lastname: "Admin",
          is_system_admin: true,
          username: "sysadmin",
        }),
        sampleUser({
          public_id: "u-null",
          firstname: "No",
          lastname: "Login",
          username: null,
          has_auth: false,
        }),
        sampleUser({
          public_id: "u-third",
          firstname: "Third",
          lastname: "User",
          username: "third",
        }),
      ],
      count: 3,
    });
    renderPage();
    await flushUntil(() => (container.textContent ?? "").includes("Sys, Admin"));
    expect(container.textContent).toContain("Admin");
    expect(container.textContent).toContain("—");
    expect(mockListAdminUsers).toHaveBeenCalledWith({
      search: "",
      limit: ADMIN_USERS_PAGE_SIZE,
      offset: 0,
    });
  });

  it("enables Next and disables Prev at offset 0 with count 120; Next requests offset 50", async () => {
    mockListAdminUsers.mockImplementation(async (params: { offset: number }) => ({
      data: [sampleUser({ public_id: `page-${params.offset}` })],
      count: 120,
    }));
    renderPage();
    await flushUntil(() => (container.textContent ?? "").includes("Showing 1–50"));
    const prev = container.querySelector(".pagination-buttons button:first-child") as HTMLButtonElement;
    const next = container.querySelector(".pagination-buttons button:last-child") as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    await act(async () => {
      next.click();
    });
    await flushUntil(() =>
      mockListAdminUsers.mock.calls.some(
        (call) => (call[0] as { offset: number }).offset === ADMIN_USERS_PAGE_SIZE,
      ),
    );
    expect(mockListAdminUsers).toHaveBeenCalledWith({
      search: "",
      limit: ADMIN_USERS_PAGE_SIZE,
      offset: ADMIN_USERS_PAGE_SIZE,
    });
  });

  it("clamps an out-of-range offset back to the last valid page instead of stranding the admin (P2)", async () => {
    // Fixture: 120 users while paging forward; by the time page 2 is requested
    // the population has shrunk to 40, so offset 50 returns an EMPTY page.
    let total = 120;
    mockListAdminUsers.mockImplementation(async (params: { offset: number }) => {
      if (params.offset >= total) return { data: [], count: total };
      return { data: [sampleUser({ public_id: `page-${params.offset}` })], count: total };
    });
    renderPage();
    await flushUntil(() => (container.textContent ?? "").includes("Showing 1–50 of 120"));
    total = 40;
    const next = container.querySelector(".pagination-buttons button:last-child") as HTMLButtonElement;
    await act(async () => {
      next.click();
    });
    // The empty offset-50 page must trigger a re-request at the clamped offset 0 …
    // (two sequential round trips: the empty page, then the clamped refetch —
    // wait for each explicitly so a single flush budget is not the limit).
    await flushUntil(() =>
      mockListAdminUsers.mock.calls.some((c) => (c[0] as { offset: number }).offset === ADMIN_USERS_PAGE_SIZE),
    );
    await flushUntil(() => {
      const calls = mockListAdminUsers.mock.calls.map((c) => (c[0] as { offset: number }).offset);
      return calls.length >= 3 && calls.at(-1) === 0;
    });
    await flushUntil(() => (container.textContent ?? "").includes("Showing 1–40 of 40"));
    expect(container.textContent).toContain("Showing 1–40 of 40");
    const offsets = mockListAdminUsers.mock.calls.map((c) => (c[0] as { offset: number }).offset);
    expect(offsets).toContain(ADMIN_USERS_PAGE_SIZE);
    expect(offsets.at(-1)).toBe(0);
    // … and the controls are back (Prev disabled at page 1, Next disabled at 40 of 40).
    const prev = container.querySelector(".pagination-buttons button:first-child") as HTMLButtonElement;
    const nextAfter = container.querySelector(".pagination-buttons button:last-child") as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(nextAfter.disabled).toBe(true);
  });

  it("a search change resets to page 1 even when the new search has a CACHED result at the old offset (re-review regression)", async () => {
    // Codex re-review: the search-reset effect (setOffset(0)) and the clamp
    // effect land in the same batch when the new search key already has a
    // cached result at the old offset; a non-functional clamp would out-vote
    // the reset and land on the new search's LAST page instead of page 1.
    mockListAdminUsers.mockImplementation(async (params: { search: string; offset: number }) => {
      const count = params.search === "zed" ? 70 : 120;
      if (params.offset >= count) return { data: [], count };
      return { data: [sampleUser({ public_id: `${params.search}-${params.offset}` })], count };
    });
    renderPage();
    await flushUntil(() => (container.textContent ?? "").includes("Showing 1–50 of 120"));
    const nextBtn = () =>
      container.querySelector(".pagination-buttons button:last-child") as HTMLButtonElement;
    await act(async () => {
      nextBtn().click();
    });
    await flushUntil(() => (container.textContent ?? "").includes("Showing 51–100 of 120"));
    await act(async () => {
      nextBtn().click();
    });
    await flushUntil(() => (container.textContent ?? "").includes("Showing 101–120 of 120"));
    expect(container.textContent).toContain("Showing 101–120 of 120");
    // The new search was "visited" before at this offset: seed the cache.
    queryClient.setQueryData(["admin-users", "zed", 100], { data: [], count: 70 });
    const search = container.querySelector("input[type='search']") as HTMLInputElement;
    setInputValue(search, "zed");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300); // the search debounce
    });
    await flushUntil(() =>
      mockListAdminUsers.mock.calls.some(
        (c) => (c[0] as { search: string; offset: number }).search === "zed" && (c[0] as { offset: number }).offset === 0,
      ),
    );
    const zedOffsets = mockListAdminUsers.mock.calls
      .filter((c) => (c[0] as { search: string }).search === "zed")
      .map((c) => (c[0] as { offset: number }).offset);
    expect(zedOffsets).toContain(0);
    expect(zedOffsets).not.toContain(50);
    await flushUntil(() => (container.textContent ?? "").includes("Showing 1–50 of 70"));
    expect(container.textContent).toContain("Showing 1–50 of 70");
  });

});
