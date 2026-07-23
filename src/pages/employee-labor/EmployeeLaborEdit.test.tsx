import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";
import EmployeeLaborEdit from "./EmployeeLaborEdit";
import type { CurrentUser, EmployeeLabor } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EL_A_GET_PATH = "/api/v1/get/employee-labor/el-a";
const EL_B_GET_PATH = "/api/v1/get/employee-labor/el-b";

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
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

vi.mock("../../hooks/useLookups", () => ({
  useLookups: () => ({
    data: { projects: [], sub_cost_codes: [] },
    loading: false,
  }),
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

function sampleEmployeeLabor(overrides: Partial<EmployeeLabor> = {}): EmployeeLabor {
  return {
    id: 1,
    public_id: "el-a",
    row_version: "rv-a",
    created_datetime: null,
    modified_datetime: null,
    employee_id: 1,
    project_id: null,
    work_date: "2026-07-01",
    billing_period_start: "2026-07-01",
    billing_period_end: "2026-07-15",
    total_hours: "8.00",
    hourly_rate: "50.00",
    markup: "0.10",
    total_amount: "440.00",
    sub_cost_code_id: null,
    description: "row A",
    status: "pending_review",
    source_time_entry_id: null,
    invoice_line_item_id: null,
    ...overrides,
  };
}

let doNavigate: NavigateFunction;

function NavCapture() {
  doNavigate = useNavigate();
  return null;
}

function renderEmployeeLaborEdit(root: Root) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/employee-labor/el-a/edit"] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Fragment,
            null,
            createElement(NavCapture),
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: "/employee-labor/:publicId/edit",
                element: createElement(EmployeeLaborEdit),
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

function totalHoursInput(): HTMLInputElement | null {
  return container.querySelector("#total_hours");
}

function descriptionInput(): HTMLTextAreaElement | null {
  return container.querySelector("#description");
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });

  mockGetOne.mockImplementation((path: string) => {
    if (path === EL_A_GET_PATH) {
      return Promise.resolve(sampleEmployeeLabor());
    }
    if (path === EL_B_GET_PATH) {
      return Promise.resolve(
        sampleEmployeeLabor({
          id: 2,
          public_id: "el-b",
          row_version: "rv-b",
          total_hours: "4.00",
          description: "row B",
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

describe("EmployeeLaborEdit form re-seed on route param change (U-136)", () => {
  async function waitForRowAForm() {
    await waitForCondition(() => totalHoursInput()?.value === "8.00");
    expect(totalHoursInput()?.value).toBe("8.00");
  }

  async function navigateToRowB() {
    await act(async () => {
      doNavigate("/employee-labor/el-b/edit");
    });
    await flushMicrotasks();
  }

  async function waitForRowBForm() {
    await waitForCondition(() => totalHoursInput()?.value === "4.00");
    expect(totalHoursInput()?.value).toBe("4.00");
    expect(descriptionInput()?.value).toBe("row B");
  }

  it("re-seeds form fields when publicId changes", async () => {
    renderEmployeeLaborEdit(root);
    await flushMicrotasks();
    await waitForRowAForm();

    await navigateToRowB();
    await waitForRowBForm();
  });

  it("submits row B row_version after navigating from row A", async () => {
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/employee-labor/el-b") {
        return Promise.resolve(
          sampleEmployeeLabor({
            public_id: "el-b",
            row_version: "rv-b-upd",
            total_hours: "4.00",
            description: "row B",
          }),
        );
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    renderEmployeeLaborEdit(root);
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
      "/api/v1/update/employee-labor/el-b",
      expect.objectContaining({ row_version: "rv-b" }),
    );
    expect(mockPut).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ row_version: "rv-a" }),
    );
  });

  it("refuse-renders the form without Employee Labor can_update", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: { ...adminUser(), is_admin: false, modules: [] },
      isLoading: false,
    });

    renderEmployeeLaborEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => container.textContent?.includes("permission") ?? false);

    expect(container.textContent).toContain(
      "You don't have permission to edit this employee labor entry.",
    );
    expect(totalHoursInput()).toBeNull();
  });
});
