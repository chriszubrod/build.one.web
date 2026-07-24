import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, Fragment, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";
import PaymentTermEdit from "./PaymentTermEdit";
import type { CurrentUser, PaymentTerm } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PT_A_GET_PATH = "/api/v1/get/payment-term/pt-a";
const PT_B_GET_PATH = "/api/v1/get/payment-term/pt-b";

const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();

vi.mock("../../api/client", () => ({
  getList: vi.fn(),
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

function samplePaymentTerm(overrides: Partial<PaymentTerm> = {}): PaymentTerm {
  return {
    id: 1,
    public_id: "pt-a",
    row_version: "rv-a",
    created_datetime: null,
    modified_datetime: null,
    name: "row A",
    description: "description A",
    due_days: 30,
    discount_days: 10,
    discount_percent: 2,
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

function renderPaymentTermEdit(root: Root): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/payment-term/pt-a/edit"] },
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
                path: "/payment-term/:publicId/edit",
                element: createElement(PaymentTermEdit),
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

function dueDaysInput(): HTMLInputElement | null {
  return container.querySelector("#due_days");
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });

  mockGetOne.mockImplementation((path: string) => {
    if (path === PT_A_GET_PATH) {
      return Promise.resolve(samplePaymentTerm());
    }
    if (path === PT_B_GET_PATH) {
      return Promise.resolve(
        samplePaymentTerm({
          id: 2,
          public_id: "pt-b",
          row_version: "rv-b",
          name: "row B",
          description: "description B",
          due_days: 60,
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

describe("PaymentTermEdit form re-seed on route param change (U-149)", () => {
  async function waitForRowAForm() {
    await waitForCondition(() => nameInput()?.value === "row A");
    expect(nameInput()?.value).toBe("row A");
  }

  async function navigateToRowB() {
    await act(async () => {
      doNavigate("/payment-term/pt-b/edit");
    });
    await flushMicrotasks();
  }

  async function waitForRowBForm() {
    await waitForCondition(() => nameInput()?.value === "row B");
    expect(nameInput()?.value).toBe("row B");
    expect(dueDaysInput()?.value).toBe("60");
  }

  it("re-seeds form fields when publicId changes", async () => {
    renderPaymentTermEdit(root);
    await flushMicrotasks();
    await waitForRowAForm();

    await navigateToRowB();
    await waitForRowBForm();
  });

  it("submits row B row_version after navigating from row A", async () => {
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/payment-term/pt-b") {
        return Promise.resolve(
          samplePaymentTerm({
            public_id: "pt-b",
            row_version: "rv-b-upd",
            name: "row B",
            description: "description B",
            due_days: 60,
          }),
        );
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    renderPaymentTermEdit(root);
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
      "/api/v1/update/payment-term/pt-b",
      expect.objectContaining({ row_version: "rv-b" }),
    );
    expect(mockPut).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ row_version: "rv-a" }),
    );
  });

  it("refuse-renders the form without Bills can_update", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: { ...adminUser(), is_admin: false, modules: [] },
      isLoading: false,
    });

    renderPaymentTermEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => container.textContent?.includes("permission") ?? false);

    expect(container.textContent).toContain(
      "You do not have permission to edit this payment term.",
    );
    expect(nameInput()).toBeNull();
  });
});
