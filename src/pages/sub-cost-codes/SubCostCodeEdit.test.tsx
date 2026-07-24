import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";
import SubCostCodeEdit from "./SubCostCodeEdit";
import type { CostCode, CurrentUser, SubCostCode } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCC_A_GET_PATH = "/api/v1/get/sub-cost-code/scc-a";
const SCC_B_GET_PATH = "/api/v1/get/sub-cost-code/scc-b";
const COST_CODES_LIST_PATH = "/api/v1/get/cost-codes";

const PARENT_COST_CODE_ID = 42;
const PARENT_COST_CODE_PUBLIC_ID = "cc-parent-pub";

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

function sampleCostCodes(): CostCode[] {
  return [
    {
      id: PARENT_COST_CODE_ID,
      public_id: PARENT_COST_CODE_PUBLIC_ID,
      row_version: "rv-cc",
      created_datetime: null,
      modified_datetime: null,
      number: "100",
      name: "Parent Cost Code",
      description: "Parent",
    },
  ];
}

function sampleSubCostCode(overrides: Partial<SubCostCode> = {}): SubCostCode {
  return {
    id: 1,
    public_id: "scc-a",
    row_version: "rv-a",
    created_datetime: null,
    modified_datetime: null,
    number: "100.1",
    name: "row A",
    description: "description A",
    cost_code_id: PARENT_COST_CODE_ID,
    aliases: null,
    ...overrides,
  };
}

let doNavigate: NavigateFunction;

function NavCapture() {
  doNavigate = useNavigate();
  return null;
}

function renderSubCostCodeEdit(root: Root, queryClient?: QueryClient): void {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/sub-cost-code/scc-a/edit"] },
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
                path: "/sub-cost-code/:publicId/edit",
                element: createElement(SubCostCodeEdit),
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

function numberInput(): HTMLInputElement | null {
  return container.querySelector("#number");
}

function nameInput(): HTMLInputElement | null {
  return container.querySelector("#name");
}

function costCodeSelect(): HTMLSelectElement | null {
  return container.querySelector("#cost_code_public_id");
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });

  mockGetList.mockImplementation((path: string) => {
    if (path === COST_CODES_LIST_PATH) {
      return Promise.resolve({ data: sampleCostCodes(), count: 1 });
    }
    return Promise.reject(new Error(`unexpected getList: ${path}`));
  });

  mockGetOne.mockImplementation((path: string) => {
    if (path === SCC_A_GET_PATH) {
      return Promise.resolve(sampleSubCostCode());
    }
    if (path === SCC_B_GET_PATH) {
      return Promise.resolve(
        sampleSubCostCode({
          id: 2,
          public_id: "scc-b",
          row_version: "rv-b",
          number: "200.1",
          name: "row B",
          description: "description B",
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

describe("SubCostCodeEdit form re-seed on route param change (U-138)", () => {
  async function waitForRowAForm() {
    await waitForCondition(() => numberInput()?.value === "100.1");
    expect(numberInput()?.value).toBe("100.1");
  }

  async function navigateToRowB() {
    await act(async () => {
      doNavigate("/sub-cost-code/scc-b/edit");
    });
    await flushMicrotasks();
  }

  async function waitForRowBForm() {
    await waitForCondition(() => numberInput()?.value === "200.1");
    expect(numberInput()?.value).toBe("200.1");
    expect(nameInput()?.value).toBe("row B");
  }

  it("re-seeds form fields when publicId changes", async () => {
    renderSubCostCodeEdit(root);
    await flushMicrotasks();
    await waitForRowAForm();

    await navigateToRowB();
    await waitForRowBForm();
  });

  it("submits row B row_version after navigating from row A", async () => {
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/sub-cost-code/scc-b") {
        return Promise.resolve(
          sampleSubCostCode({
            public_id: "scc-b",
            row_version: "rv-b-upd",
            number: "200.1",
            name: "row B",
            description: "description B",
          }),
        );
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    renderSubCostCodeEdit(root);
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
      "/api/v1/update/sub-cost-code/scc-b",
      expect.objectContaining({ row_version: "rv-b" }),
    );
    expect(mockPut).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ row_version: "rv-a" }),
    );
  });

  it("refuse-renders the form without Cost Codes can_update", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: { ...adminUser(), is_admin: false, modules: [] },
      isLoading: false,
    });

    renderSubCostCodeEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => container.textContent?.includes("permission") ?? false);

    expect(container.textContent).toContain(
      "You do not have permission to edit this sub cost code.",
    );
    expect(numberInput()).toBeNull();
  });

  it("prefills cost_code_public_id from the fetched cost-code list", async () => {
    renderSubCostCodeEdit(root);
    await flushMicrotasks();
    await waitForRowAForm();

    expect(costCodeSelect()?.value).toBe(PARENT_COST_CODE_PUBLIC_ID);
  });

  it("renders an error when the cost-codes list fetch fails", async () => {
    // Reject with a non-404 CLIENT error (e.g. an RBAC 403): useEntityList's own
    // retry option retries server/network errors once with a real-time backoff
    // that fake timers never elapse, so a retryable rejection would spin forever
    // here instead of settling into the error branch.
    const { ApiError } = await import("../../api/client");
    mockGetList.mockImplementation((path: string) => {
      if (path === COST_CODES_LIST_PATH) {
        return Promise.reject(new ApiError(403, "Cost codes unavailable"));
      }
      return Promise.reject(new ApiError(403, `unexpected getList: ${path}`));
    });

    renderSubCostCodeEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => container.textContent?.includes("Cost codes unavailable") ?? false);

    expect(container.querySelector(".page-error")?.textContent).toContain("Cost codes unavailable");
    expect(numberInput()).toBeNull();
  });

  it("patches the parent prefill when a fresh cost-code list arrives after a stale empty cache", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["list", COST_CODES_LIST_PATH], { data: [], count: 0 });

    renderSubCostCodeEdit(root, queryClient);
    await flushMicrotasks();
    await waitForRowAForm();

    expect(numberInput()?.value).toBe("100.1");
    expect(nameInput()?.value).toBe("row A");

    await waitForCondition(() => costCodeSelect()?.value === PARENT_COST_CODE_PUBLIC_ID);

    expect(costCodeSelect()?.value).toBe(PARENT_COST_CODE_PUBLIC_ID);
    expect(numberInput()?.value).toBe("100.1");
    expect(nameInput()?.value).toBe("row A");
  });
});
