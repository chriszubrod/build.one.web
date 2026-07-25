import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, Fragment, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";
import EmployeeEdit from "./EmployeeEdit";
import { entityItemKey } from "../../hooks/useEntity";
import type { CurrentUser, Employee } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMPLOYEE_A_GET_PATH = "/api/v1/get/employee/employee-a";
const EMPLOYEE_B_GET_PATH = "/api/v1/get/employee/employee-b";

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

function sampleEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 1,
    public_id: "employee-a",
    row_version: "rv-a",
    created_datetime: null,
    modified_datetime: null,
    firstname: "row",
    lastname: "A",
    email: null,
    hourly_rate: null,
    markup: null,
    is_active: true,
    is_deleted: false,
    notes: null,
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

function renderEmployeeEdit(root: Root, queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/employee/employee-a/edit"] },
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
                path: "/employee/:publicId/edit",
                element: createElement(EmployeeEdit),
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

function firstnameInput(): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>("#firstname");
}

function lastnameInput(): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>("#lastname");
}

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  nativeSetter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });

  mockGetOne.mockImplementation((path: string) => {
    if (path === EMPLOYEE_A_GET_PATH) {
      return Promise.resolve(sampleEmployee());
    }
    if (path === EMPLOYEE_B_GET_PATH) {
      return Promise.resolve(
        sampleEmployee({
          id: 2,
          public_id: "employee-b",
          row_version: "rv-b",
          firstname: "row",
          lastname: "B",
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

describe("EmployeeEdit form re-seed on route param change (U-151)", () => {
  // Both fixtures share firstname "row" and differ only on lastname, so the
  // seeded-row gate has to read lastname — waiting on firstname would be
  // satisfied by either row and would not prove WHICH row seeded the form.
  async function waitForRow(lastname: string) {
    await waitForCondition(() => lastnameInput()?.value === lastname);
    expect(lastnameInput()?.value).toBe(lastname);
  }

  async function navigateToRowB() {
    await act(async () => {
      doNavigate("/employee/employee-b/edit");
    });
    await flushMicrotasks();
  }

  it("re-seeds form fields when publicId changes", async () => {
    renderEmployeeEdit(root);
    await flushMicrotasks();
    await waitForRow("A");

    await navigateToRowB();
    await waitForRow("B");
  });

  it("submits row B row_version after navigating from row A", async () => {
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/employee/employee-b") {
        return Promise.resolve(
          sampleEmployee({
            public_id: "employee-b",
            row_version: "rv-b-upd",
            firstname: "row",
            lastname: "B",
          }),
        );
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    renderEmployeeEdit(root);
    await flushMicrotasks();
    await waitForRow("A");
    await navigateToRowB();
    await waitForRow("B");

    const form = container.querySelector("form.form-card") as HTMLFormElement;
    expect(form).not.toBeNull();

    await act(async () => {
      form.requestSubmit();
      await flushMicrotasks();
    });

    expect(mockPut).toHaveBeenCalledWith(
      "/api/v1/update/employee/employee-b",
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

    renderEmployeeEdit(root, queryClient);
    await flushMicrotasks();
    await waitForRow("A");

    const editedFirstname = "user edited name";
    const input = firstnameInput();
    expect(input).not.toBeNull();

    await act(async () => {
      setInputValue(input!, editedFirstname);
    });
    await flushMicrotasks();
    expect(firstnameInput()?.value).toBe(editedFirstname);

    const getOneCallsBeforeRefetch = mockGetOne.mock.calls.length;

    mockGetOne.mockImplementation((path: string) => {
      if (path === EMPLOYEE_A_GET_PATH) {
        return Promise.resolve(
          sampleEmployee({
            row_version: "rv-a-refreshed",
            firstname: "server refreshed name",
          }),
        );
      }
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: entityItemKey(EMPLOYEE_A_GET_PATH) });
      await flushMicrotasks();
    });

    expect(mockGetOne.mock.calls.length).toBeGreaterThan(getOneCallsBeforeRefetch);
    expect(mockGetOne.mock.calls.at(-1)?.[0]).toBe(EMPLOYEE_A_GET_PATH);
    await waitForCondition(() => {
      const cached = queryClient.getQueryData<Employee>(entityItemKey(EMPLOYEE_A_GET_PATH));
      return cached?.row_version === "rv-a-refreshed";
    });

    expect(firstnameInput()?.value).toBe(editedFirstname);
  });

  it("refuse-renders the form without Employees can_update", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: { ...adminUser(), is_admin: false, modules: [] },
      isLoading: false,
    });

    renderEmployeeEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => container.textContent?.includes("permission") ?? false);

    expect(container.textContent).toContain(
      "You do not have permission to edit this employee.",
    );
    expect(firstnameInput()).toBeNull();
  });
});
