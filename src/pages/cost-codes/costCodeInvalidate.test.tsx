import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CostCodeCreate from "./CostCodeCreate";
import CostCodeEdit from "./CostCodeEdit";
import CostCodeView from "./CostCodeView";
import { setInputValue } from "../../__testutils__/domEvents";
import { flushUntil } from "../../__testutils__/flush";
import type { CostCode, CurrentUser } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_ID = "abc123";
const LIST_PATH = "/api/v1/get/cost-codes";
const ITEM_PATH = `/api/v1/get/cost-code/${PUBLIC_ID}`;

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

function sampleCostCode(overrides: Partial<CostCode> = {}): CostCode {
  return {
    id: 1,
    public_id: PUBLIC_ID,
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    number: "100",
    name: "General Conditions",
    description: "Default cost code",
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
  mockCreateEntity.mockResolvedValue(sampleCostCode());
  mockUpdateEntity.mockResolvedValue(undefined);
  mockDeleteEntity.mockResolvedValue(undefined);
  mockInvalidateEntity.mockResolvedValue(undefined);
  mockRemoveEntity.mockResolvedValue(undefined);
  mockInvalidateLookups.mockResolvedValue(undefined);
  mockUseEntityItem.mockReturnValue({
    item: sampleCostCode(),
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

describe("cost-code cache invalidation", () => {
  it("create invalidates list and lookups", async () => {
    renderPage(createElement(CostCodeCreate), "/cost-code/create", "/cost-code/create");

    const numberInput = container.querySelector('input[name="number"]') as HTMLInputElement;
    const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement;
    setInputValue(numberInput, "100");
    setInputValue(nameInput, "General Conditions");

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
      createElement(CostCodeEdit),
      `/cost-code/${PUBLIC_ID}/edit`,
      "/cost-code/:publicId/edit",
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
      createElement(CostCodeView),
      `/cost-code/${PUBLIC_ID}`,
      "/cost-code/:publicId",
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
