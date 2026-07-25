import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";
import CompanyEdit from "./CompanyEdit";
import { assertGuardSurvivesSameRowRefetch } from "../../__testutils__/formSeedGuardHarness";
import { flushUntil as waitForCondition } from "../../__testutils__/flush";
import type { CurrentUser, Company } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CO_A_GET_PATH = "/api/v1/get/company/co-a";
const CO_B_GET_PATH = "/api/v1/get/company/co-b";

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();

vi.mock("../../components/InlineContacts", () => ({
  default: () => null,
}));

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

function sampleCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 1,
    public_id: "co-a",
    row_version: "rv-a",
    created_datetime: null,
    modified_datetime: null,
    name: "row A",
    website: "https://a.example",
    ...overrides,
  };
}

let doNavigate: NavigateFunction;

function NavCapture() {
  doNavigate = useNavigate();
  return null;
}

function renderCompanyEdit(root: Root) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/company/co-a/edit"] },
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
                path: "/company/:publicId/edit",
                element: createElement(CompanyEdit),
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


function nameInput(): HTMLInputElement | null {
  return container.querySelector("#name");
}

function websiteInput(): HTMLInputElement | null {
  return container.querySelector("#website");
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });

  mockGetOne.mockImplementation((path: string) => {
    if (path === CO_A_GET_PATH) {
      return Promise.resolve(sampleCompany());
    }
    if (path === CO_B_GET_PATH) {
      return Promise.resolve(
        sampleCompany({
          id: 2,
          public_id: "co-b",
          row_version: "rv-b",
          name: "row B",
          website: "https://b.example",
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

describe("CompanyEdit form re-seed on route param change (U-143)", () => {
  async function waitForRowAForm() {
    await waitForCondition(() => nameInput()?.value === "row A");
    expect(nameInput()?.value).toBe("row A");
  }

  async function navigateToRowB() {
    await act(async () => {
      doNavigate("/company/co-b/edit");
    });
    await flushMicrotasks();
  }

  async function waitForRowBForm() {
    await waitForCondition(() => nameInput()?.value === "row B");
    expect(nameInput()?.value).toBe("row B");
    expect(websiteInput()?.value).toBe("https://b.example");
  }

  it("re-seeds form fields when publicId changes", async () => {
    renderCompanyEdit(root);
    await flushMicrotasks();
    await waitForRowAForm();

    await navigateToRowB();
    await waitForRowBForm();
  });

  it("submits row B row_version after navigating from row A", async () => {
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/company/co-b") {
        return Promise.resolve(
          sampleCompany({
            public_id: "co-b",
            row_version: "rv-b-upd",
            name: "row B",
            website: "https://b.example",
          }),
        );
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    renderCompanyEdit(root);
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
      "/api/v1/update/company/co-b",
      expect.objectContaining({ row_version: "rv-b" }),
    );
    expect(mockPut).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ row_version: "rv-a" }),
    );
  });

  it("does not clobber in-progress edits on same-publicId background refetch", async () => {
    await assertGuardSurvivesSameRowRefetch({
      container,
      root,
      component: createElement(CompanyEdit),
      routePath: "/company/:publicId/edit",
      initialEntry: "/company/co-a/edit",
      itemPath: CO_A_GET_PATH,
      mockGetOne,
      fieldSelector: "#name",
      seededValue: "row A",
      editedValue: "user edited name",
      refreshedRow: sampleCompany({
        row_version: "rv-a-refreshed",
        name: "server refreshed name",
        website: "https://refreshed.example",
      }),
      untouched: { selector: "#website", expected: "https://a.example" },
    });
  });

  it("refuse-renders the form without Companies can_update", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: { ...adminUser(), is_admin: false, modules: [] },
      isLoading: false,
    });

    renderCompanyEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => container.textContent?.includes("permission") ?? false);

    expect(container.textContent).toContain(
      "You do not have permission to edit this company.",
    );
    expect(nameInput()).toBeNull();
  });
});
