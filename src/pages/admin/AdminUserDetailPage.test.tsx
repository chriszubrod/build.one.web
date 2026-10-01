import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminUserDetailPage from "./AdminUserDetailPage";
import type { AdminUserSummary, Role } from "../../types/api";
import { setInputValue } from "../../__testutils__/domEvents";
import { flushUntil } from "../../__testutils__/flush";
import { makeUser } from "../../__testutils__/currentUser";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetAdminUser = vi.fn();
const mockGetAdminUserAudit = vi.fn();
const mockListRoles = vi.fn();
const mockAssignRole = vi.fn();
const mockRemoveRole = vi.fn();
const mockSetCredentials = vi.fn();
const mockToast = vi.fn();

vi.mock("./adminApi", () => ({
  getAdminUser: (...args: unknown[]) => mockGetAdminUser(...args),
  getAdminUserAudit: (...args: unknown[]) => mockGetAdminUserAudit(...args),
  listRoles: (...args: unknown[]) => mockListRoles(...args),
  assignRole: (...args: unknown[]) => mockAssignRole(...args),
  removeRole: (...args: unknown[]) => mockRemoveRole(...args),
  setCredentials: (...args: unknown[]) => mockSetCredentials(...args),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockUseCurrentUser = vi.fn(() => ({
  data: makeUser(true),
  isLoading: false,
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

const TARGET_PUBLIC_ID = "target-user-pub";

function sampleSummary(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    public_id: TARGET_PUBLIC_ID,
    id: 42,
    firstname: "Jane",
    lastname: "Doe",
    is_system_admin: false,
    is_agent: false,
    username: "jane",
    has_auth: true,
    email: "jane@example.com",
    roles: [
      {
        user_role_public_id: "ur-assigned",
        role_public_id: "role-b-pub",
        role_id: 2,
        role_name: "Role B",
        company_id: null,
      },
    ],
    created_datetime: "2024-01-15T12:00:00Z",
    ...overrides,
  };
}

function sampleRoles(): Role[] {
  return [
    {
      id: 1,
      public_id: "role-a-pub",
      row_version: "rv1",
      created_datetime: null,
      modified_datetime: null,
      name: "Role A",
    },
    {
      id: 2,
      public_id: "role-b-pub",
      row_version: "rv2",
      created_datetime: null,
      modified_datetime: null,
      name: "Role B",
    },
    {
      id: 3,
      public_id: "role-c-pub",
      row_version: "rv3",
      created_datetime: null,
      modified_datetime: null,
      name: "Role C",
    },
  ];
}

let container: HTMLDivElement;
let root: Root | null = null;
let queryClient: QueryClient;

function renderPage() {
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
          { initialEntries: [`/admin/user/${TARGET_PUBLIC_ID}`] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/admin/user/:publicId",
              element: createElement(AdminUserDetailPage),
            }),
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

async function waitForDetailLoaded() {
  await flushUntil(() => (container.textContent ?? "").includes("Jane Doe"));
}

beforeEach(() => {
  // flushUntil advances FAKE timers — the house precondition (src/__testutils__/flush.ts).
  vi.useFakeTimers();
  mockGetAdminUser.mockReset();
  mockGetAdminUserAudit.mockReset();
  mockListRoles.mockReset();
  mockAssignRole.mockReset();
  mockRemoveRole.mockReset();
  mockSetCredentials.mockReset();
  mockToast.mockReset();
  mockUseCurrentUser.mockReset();

  mockUseCurrentUser.mockReturnValue({ data: makeUser(true), isLoading: false });
  mockGetAdminUser.mockResolvedValue(sampleSummary());
  mockGetAdminUserAudit.mockResolvedValue({ data: [], count: 0 });
  mockListRoles.mockResolvedValue({ data: sampleRoles(), count: 3 });
  mockAssignRole.mockResolvedValue({});
  mockRemoveRole.mockResolvedValue(undefined);
  mockSetCredentials.mockResolvedValue({ username: "jane", has_auth: true });

  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  vi.useRealTimers();
});

describe("AdminUserDetailPage", () => {
  it("redirects non-admins to /profile without calling getAdminUser", async () => {
    mockUseCurrentUser.mockReturnValue({ data: makeUser(false), isLoading: false });
    renderPage();
    await flushUntil(() => container.querySelector("[data-testid='profile-landed']") != null);
    expect(mockGetAdminUser).not.toHaveBeenCalled();
  });

  it("assignable-roles select excludes roles already assigned to the user", async () => {
    renderPage();
    await waitForDetailLoaded();
    const select = container.querySelector("#assign-role") as HTMLSelectElement;
    const optionLabels = Array.from(select.options)
      .map((o) => o.textContent)
      .filter((t) => t && t !== "Select…");
    expect(optionLabels).toEqual(["Role A", "Role C"]);
    expect(optionLabels).toHaveLength(2);
  });

  it("assignRole receives numeric user_id and role_id", async () => {
    renderPage();
    await waitForDetailLoaded();
    const select = container.querySelector("#assign-role") as HTMLSelectElement;
    await act(async () => {
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const assignBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Assign",
    )!;
    await act(async () => {
      assignBtn.click();
    });
    await flushUntil(() => mockAssignRole.mock.calls.length === 1);
    expect(mockAssignRole).toHaveBeenCalledWith({ user_id: 42, role_id: 1 });
  });

  it("removeRole is called with the user_role public id when Remove is confirmed", async () => {
    renderPage();
    await waitForDetailLoaded();
    const removeBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Remove",
    )!;
    await act(async () => {
      removeBtn.click();
    });
    await flushUntil(() => mockRemoveRole.mock.calls.length === 1);
    expect(mockRemoveRole).toHaveBeenCalledWith("ur-assigned");
  });

  it("reset password: mismatched confirm shows inline error and does not POST", async () => {
    renderPage();
    await waitForDetailLoaded();
    setInputValue(container.querySelector("#cred_password") as HTMLInputElement, "longpassword");
    setInputValue(container.querySelector("#cred_confirm") as HTMLInputElement, "differentone");
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Passwords do not match.");
    expect(mockSetCredentials).not.toHaveBeenCalled();
  });

  it("reset password: password shorter than 8 characters does not POST", async () => {
    renderPage();
    await waitForDetailLoaded();
    setInputValue(container.querySelector("#cred_password") as HTMLInputElement, "1234567");
    setInputValue(container.querySelector("#cred_confirm") as HTMLInputElement, "1234567");
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Password must be at least 8 characters.");
    expect(mockSetCredentials).not.toHaveBeenCalled();
  });

  it("reset password: valid input POSTs once and clears password fields", async () => {
    renderPage();
    await waitForDetailLoaded();
    setInputValue(container.querySelector("#cred_username") as HTMLInputElement, "newjane");
    setInputValue(container.querySelector("#cred_password") as HTMLInputElement, "validpass1");
    setInputValue(container.querySelector("#cred_confirm") as HTMLInputElement, "validpass1");
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    await flushUntil(() => mockSetCredentials.mock.calls.length === 1);
    expect(mockSetCredentials).toHaveBeenCalledTimes(1);
    expect(mockSetCredentials).toHaveBeenCalledWith(TARGET_PUBLIC_ID, {
      username: "newjane",
      password: "validpass1",
    });
    const pw = container.querySelector("#cred_password") as HTMLInputElement;
    const confirm = container.querySelector("#cred_confirm") as HTMLInputElement;
    expect(pw.value).toBe("");
    expect(confirm.value).toBe("");
  });

  // ---- Fix-round regression tests (Codex Pass-1, U-585) ----

  it("reset password: a FAILED submit still clears both password fields (P2)", async () => {
    mockSetCredentials.mockRejectedValue(new Error("server down"));
    renderPage();
    await waitForDetailLoaded();
    setInputValue(container.querySelector("#cred_username") as HTMLInputElement, "jane");
    setInputValue(container.querySelector("#cred_password") as HTMLInputElement, "validpass1");
    setInputValue(container.querySelector("#cred_confirm") as HTMLInputElement, "validpass1");
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    await flushUntil(() => mockSetCredentials.mock.calls.length === 1);
    expect(mockSetCredentials).toHaveBeenCalledTimes(1);
    const pw = container.querySelector("#cred_password") as HTMLInputElement;
    const confirm = container.querySelector("#cred_confirm") as HTMLInputElement;
    await flushUntil(() => pw.value === "" && confirm.value === "");
    expect(pw.value).toBe("");
    expect(confirm.value).toBe("");
    expect(mockToast).toHaveBeenCalledWith("server down", "error");
  });

  it("renders audit rows through the action-aware formatter — credential detail never dumps raw JSON (P3)", async () => {
    mockGetAdminUserAudit.mockResolvedValue({
      data: [
        {
          public_id: "audit-1",
          created_datetime: "2024-02-01T10:00:00Z",
          actor_user_id: 17,
          actor_name: "Chris Z",
          actor_is_system_admin: true,
          action: "auth.set_credentials",
          target_user_id: 42,
          // A password-like key must not reach the DOM even if the API ever leaked one.
          detail: { username: "jane", created: false, password: "must-not-render" },
        },
        {
          public_id: "audit-2",
          created_datetime: "2024-02-02T10:00:00Z",
          actor_user_id: 99,
          actor_name: null, // actor no longer resolvable (deleted user) — not "system"
          actor_is_system_admin: false,
          action: "user_role.assign",
          target_user_id: 42,
          detail: { role_id: 2 },
        },
      ],
      count: 2,
    });
    renderPage();
    await waitForDetailLoaded();
    await flushUntil(() => (container.textContent ?? "").includes("username: jane; updated"));
    const text = container.textContent ?? "";
    expect(text).toContain("username: jane; updated");
    expect(text).not.toContain("must-not-render");
    expect(text).toContain("role: Role B");
    expect(text).toContain("Chris Z");
    expect(text).toContain("User #99");
    expect(text).not.toContain("No admin actions recorded.");
  });

  it("shows an error when the audit read fails instead of claiming no actions exist (P2)", async () => {
    mockGetAdminUserAudit.mockRejectedValue(new Error("audit boom"));
    renderPage();
    await waitForDetailLoaded();
    await flushUntil(() => (container.textContent ?? "").includes("Could not load admin actions"));
    expect(container.textContent).toContain("Could not load admin actions: audit boom");
    expect(container.textContent).not.toContain("No admin actions recorded.");
  });

  it("assign role: a second click while the first POST is in flight issues no second POST (P2)", async () => {
    let resolveAssign: (() => void) | null = null;
    mockAssignRole.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveAssign = resolve;
        }),
    );
    renderPage();
    await waitForDetailLoaded();
    const select = container.querySelector("#assign-role") as HTMLSelectElement;
    await act(async () => {
      select.value = "1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const assignBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Assign",
    )!;
    await act(async () => {
      assignBtn.click();
    });
    await flushUntil(() => mockAssignRole.mock.calls.length === 1);
    expect(mockAssignRole).toHaveBeenCalledTimes(1);
    expect(assignBtn.disabled).toBe(true);
    expect(assignBtn.textContent).toBe("Working…");
    await act(async () => {
      assignBtn.click(); // disabled + roleBusy — must be a no-op
    });
    expect(mockAssignRole).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveAssign?.();
    });
    await flushUntil(() => assignBtn.textContent === "Assign");
    expect(assignBtn.textContent).toBe("Assign");
  });
});
