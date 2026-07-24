import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, Fragment, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";
import RoleEdit from "./RoleEdit";
import { entityItemKey } from "../../hooks/useEntity";
import type { CurrentUser, Role } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROLE_A_GET_PATH = "/api/v1/get/role/role-a";
const ROLE_B_GET_PATH = "/api/v1/get/role/role-b";

const mockGetOne = vi.fn();
const mockPut = vi.fn();

vi.mock("../../api/client", () => ({
  getList: vi.fn(),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: vi.fn(),
  put: (...args: unknown[]) => mockPut(...args),
  del: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  },
}));

const mockUseCurrentUser = vi.fn(() => ({
  data: adminUser(),
  isLoading: false,
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

function adminUser(): CurrentUser {
  return {
    is_admin: true,
    modules: [],
    auth: { public_id: "a", username: "admin" },
    user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
    role: null,
    accessible_project_ids: [],
  };
}

function sampleRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 1,
    public_id: "role-a",
    row_version: "rv-a",
    created_datetime: null,
    modified_datetime: null,
    name: "row A",
    ...overrides,
  };
}

let doNavigate: NavigateFunction;

function NavCapture() {
  const navigate = useNavigate();
  // Assigning during render trips react-hooks/globals; capture in an effect.
  useEffect(() => {
    doNavigate = navigate;
  });
  return null;
}

function renderRoleEdit(root: Root, queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/role/role-a/edit"] },
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            Fragment,
            null,
            createElement(NavCapture),
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: "/role/:publicId/edit",
                element: createElement(RoleEdit),
              }),
            ),
          ),
        ),
      ),
    );
  });
}

async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 40; i++) {
      await Promise.resolve();
    }
  });
}

async function waitForCondition(check: () => boolean) {
  await act(async () => {
    for (let i = 0; i < 50; i++) {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      if (check()) return;
    }
  });
}

function nameInput(): HTMLInputElement | null {
  return container.querySelector("#name");
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });

  mockGetOne.mockImplementation((path: string) => {
    if (path === ROLE_A_GET_PATH) {
      return Promise.resolve(sampleRole());
    }
    if (path === ROLE_B_GET_PATH) {
      return Promise.resolve(
        sampleRole({
          id: 2,
          public_id: "role-b",
          row_version: "rv-b",
          name: "row B",
        }),
      );
    }
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
  vi.useRealTimers();
});

describe("RoleEdit form re-seed on route param change (U-147)", () => {
  async function waitForRowAForm() {
    await waitForCondition(() => nameInput()?.value === "row A");
    expect(nameInput()?.value).toBe("row A");
  }

  async function navigateToRowB() {
    await act(async () => {
      doNavigate("/role/role-b/edit");
    });
    await flushMicrotasks();
  }

  async function waitForRowBForm() {
    await waitForCondition(() => nameInput()?.value === "row B");
    expect(nameInput()?.value).toBe("row B");
  }

  it("re-seeds form fields when publicId changes", async () => {
    renderRoleEdit(root);
    await flushMicrotasks();
    await waitForRowAForm();

    await navigateToRowB();
    await waitForRowBForm();
  });

  it("submits row B row_version after navigating from row A", async () => {
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/role/role-b") {
        return Promise.resolve(
          sampleRole({
            public_id: "role-b",
            row_version: "rv-b-upd",
            name: "row B",
          }),
        );
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    renderRoleEdit(root);
    await flushMicrotasks();
    await waitForRowAForm();
    await navigateToRowB();
    await waitForRowBForm();

    const form = container.querySelector("form.form-card") as HTMLFormElement;
    expect(form).not.toBeNull();

    await act(async () => {
      form.requestSubmit();
      await flushMicrotasks();
    });

    expect(mockPut).toHaveBeenCalledWith(
      "/api/v1/update/role/role-b",
      expect.objectContaining({ row_version: "rv-b" }),
    );
    expect(mockPut).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ row_version: "rv-a" }),
    );
  });

  it("does not clobber in-progress edits on same-publicId background refetch", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderRoleEdit(root, queryClient);
    await flushMicrotasks();
    await waitForRowAForm();

    const editedName = "user edited name";
    const input = nameInput();
    expect(input).not.toBeNull();

    await act(async () => {
      input!.value = editedName;
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(nameInput()?.value).toBe(editedName);

    mockGetOne.mockImplementation((path: string) => {
      if (path === ROLE_A_GET_PATH) {
        return Promise.resolve(
          sampleRole({
            row_version: "rv-a-refreshed",
            name: "server refreshed name",
          }),
        );
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: entityItemKey(ROLE_A_GET_PATH) });
      await flushMicrotasks();
    });

    expect(nameInput()?.value).toBe(editedName);
  });

  it("refuse-renders the form without Roles can_update", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: { ...adminUser(), is_admin: false, modules: [] },
      isLoading: false,
    });

    renderRoleEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => container.textContent?.includes("permission") ?? false);

    expect(container.textContent).toContain(
      "You do not have permission to edit this role.",
    );
    expect(nameInput()).toBeNull();
  });
});
