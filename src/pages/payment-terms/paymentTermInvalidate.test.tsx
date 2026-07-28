import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PaymentTermCreate from "./PaymentTermCreate";
import PaymentTermEdit from "./PaymentTermEdit";
import PaymentTermView from "./PaymentTermView";
import { flushUntil } from "../../__testutils__/flush";
import type { CurrentUser, PaymentTerm } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_ID = "abc123";
const LIST_PATH = "/api/v1/get/payment-terms";
const ITEM_PATH = `/api/v1/get/payment-term/${PUBLIC_ID}`;

const mockNavigate = vi.fn();
const mockCreateEntity = vi.fn();
const mockUpdateEntity = vi.fn();
const mockDeleteEntity = vi.fn();
const mockInvalidateEntity = vi.fn();
const mockRemoveEntity = vi.fn();
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
}));

function samplePaymentTerm(overrides: Partial<PaymentTerm> = {}): PaymentTerm {
  return {
    id: 1,
    public_id: PUBLIC_ID,
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    name: "Net 30",
    description: "Default payment term",
    due_days: 30,
    discount_days: 10,
    discount_percent: 2,
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
  mockCreateEntity.mockResolvedValue(samplePaymentTerm());
  mockUpdateEntity.mockResolvedValue(undefined);
  mockDeleteEntity.mockResolvedValue(undefined);
  mockInvalidateEntity.mockResolvedValue(undefined);
  mockRemoveEntity.mockResolvedValue(undefined);
  mockUseEntityItem.mockReturnValue({
    item: samplePaymentTerm(),
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

describe("payment-term cache invalidation", () => {
  it("create invalidates list only", async () => {
    renderPage(createElement(PaymentTermCreate), "/payment-term/create", "/payment-term/create");

    const form = container.querySelector("form");
    expect(form).toBeTruthy();

    await act(async () => {
      form!.requestSubmit();
    });

    await flushUntil(() => mockInvalidateEntity.mock.calls.length > 0);

    expect(mockInvalidateEntity).toHaveBeenCalledWith(expect.anything(), { listPath: LIST_PATH });
  });

  it("edit invalidates list and item", async () => {
    renderPage(
      createElement(PaymentTermEdit),
      `/payment-term/${PUBLIC_ID}/edit`,
      "/payment-term/:publicId/edit",
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
  });

  it("delete removes list and item from cache", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));

    renderPage(
      createElement(PaymentTermView),
      `/payment-term/${PUBLIC_ID}`,
      "/payment-term/:publicId",
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

    vi.unstubAllGlobals();
  });
});
