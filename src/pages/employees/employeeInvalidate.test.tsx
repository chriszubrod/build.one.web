import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EmployeeCreate from "./EmployeeCreate";
import EmployeeEdit from "./EmployeeEdit";
import EmployeeView from "./EmployeeView";
import { setInputValue } from "../../__testutils__/domEvents";
import { flushUntil } from "../../__testutils__/flush";
import type { CurrentUser, Employee } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_ID = "abc123";
const LIST_PATH = "/api/v1/get/employees";
const ITEM_PATH = `/api/v1/get/employee/${PUBLIC_ID}`;

const mockNavigate = vi.fn();
const mockCreateEntity = vi.fn();
const mockUpdateEntity = vi.fn();
const mockDeleteEntity = vi.fn();
const mockInvalidateEntity = vi.fn();
const mockRemoveEntity = vi.fn();
const mockInvalidateLookups = vi.fn();
const mockUseEntityItem = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
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

const mockUseCurrentUser = vi.fn(() => ({
  data: adminUser(),
  isLoading: false,
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

vi.mock("../../hooks/useEntity", () => ({
  useEntityItem: (path: string) => mockUseEntityItem(path),
  createEntity: (...args: unknown[]) => mockCreateEntity(...args),
  updateEntity: (...args: unknown[]) => mockUpdateEntity(...args),
  deleteEntity: (...args: unknown[]) => mockDeleteEntity(...args),
  invalidateEntity: (...args: unknown[]) => mockInvalidateEntity(...args),
  removeEntity: (...args: unknown[]) => mockRemoveEntity(...args),
  invalidateLookups: (...args: unknown[]) => mockInvalidateLookups(...args),
}));

function sampleEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 1,
    public_id: PUBLIC_ID,
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    firstname: "Jane",
    lastname: "Smith",
    email: "jane@example.com",
    hourly_rate: "75.00",
    markup: "0.50",
    is_active: true,
    is_deleted: false,
    notes: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function renderPage(
  element: ReturnType<typeof createElement>,
  initialEntry: string,
  routePath: string,
) {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Routes,
            null,
            createElement(Route, { path: routePath, element }),
          ),
        ),
      ),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });
  mockCreateEntity.mockResolvedValue(sampleEmployee());
  mockUpdateEntity.mockResolvedValue(undefined);
  mockDeleteEntity.mockResolvedValue(undefined);
  mockInvalidateEntity.mockResolvedValue(undefined);
  mockRemoveEntity.mockResolvedValue(undefined);
  mockInvalidateLookups.mockResolvedValue(undefined);
  mockUseEntityItem.mockReturnValue({
    item: sampleEmployee(),
    loading: false,
    error: "",
    reload: vi.fn(),
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

describe("employee cache invalidation", () => {
  it("create invalidates list and lookups", async () => {
    renderPage(createElement(EmployeeCreate), "/employee/create", "/employee/create");

    setInputValue(container.querySelector('input[name="firstname"]') as HTMLInputElement, "Jane");
    setInputValue(container.querySelector('input[name="lastname"]') as HTMLInputElement, "Smith");

    const form = container.querySelector("form");
    expect(form).toBeTruthy();

    await act(async () => {
      form!.requestSubmit();
    });

    await flushUntil(() => mockInvalidateEntity.mock.calls.length > 0);

    expect(mockInvalidateEntity).toHaveBeenCalledWith(expect.anything(), { listPath: LIST_PATH });
    expect(mockInvalidateLookups).toHaveBeenCalledTimes(1);
  });

  it("edit invalidates list, item and lookups", async () => {
    renderPage(
      createElement(EmployeeEdit),
      `/employee/${PUBLIC_ID}/edit`,
      "/employee/:publicId/edit",
    );

    const form = container.querySelector("form");
    expect(form).toBeTruthy();

    await act(async () => {
      form!.requestSubmit();
    });

    await flushUntil(() => mockInvalidateEntity.mock.calls.length > 0);

    expect(mockInvalidateEntity).toHaveBeenCalledWith(expect.anything(), {
      listPath: LIST_PATH,
      itemPath: ITEM_PATH,
    });
    expect(mockInvalidateLookups).toHaveBeenCalledTimes(1);
  });

  it("delete removes list and item, and invalidates lookups", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));

    renderPage(
      createElement(EmployeeView),
      `/employee/${PUBLIC_ID}`,
      "/employee/:publicId",
    );

    const deleteButton = container.querySelector(".btn-danger") as HTMLButtonElement;
    expect(deleteButton).toBeTruthy();

    await act(async () => {
      deleteButton.click();
    });

    await flushUntil(() => mockRemoveEntity.mock.calls.length > 0);

    expect(mockRemoveEntity).toHaveBeenCalledWith(expect.anything(), {
      listPath: LIST_PATH,
      itemPath: ITEM_PATH,
    });
    expect(mockInvalidateEntity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ itemPath: expect.anything() }),
    );
    expect(mockInvalidateLookups).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
