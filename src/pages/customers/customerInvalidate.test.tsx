import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CustomerCreate from "./CustomerCreate";
import CustomerEdit from "./CustomerEdit";
import CustomerView from "./CustomerView";
import { setInputValue } from "../../__testutils__/domEvents";
import { flushUntil } from "../../__testutils__/flush";
import type { Customer } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_ID = "abc123";
const LIST_PATH = "/api/v1/get/customers";
const ITEM_PATH = `/api/v1/get/customer/${PUBLIC_ID}`;

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

vi.mock("../../components/InlineContacts", () => ({
  default: () => null,
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

function sampleCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 1,
    public_id: PUBLIC_ID,
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    name: "Acme Corp",
    email: "contact@acme.com",
    phone: "555-0100",
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
  mockCreateEntity.mockResolvedValue(sampleCustomer());
  mockUpdateEntity.mockResolvedValue(undefined);
  mockDeleteEntity.mockResolvedValue(undefined);
  mockInvalidateEntity.mockResolvedValue(undefined);
  mockRemoveEntity.mockResolvedValue(undefined);
  mockInvalidateLookups.mockResolvedValue(undefined);
  mockUseEntityItem.mockReturnValue({
    item: sampleCustomer(),
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

describe("customer cache invalidation", () => {
  it("create invalidates list and lookups", async () => {
    renderPage(createElement(CustomerCreate), "/customer/create", "/customer/create");

    setInputValue(container.querySelector('input[name="name"]') as HTMLInputElement, "Acme Corp");
    setInputValue(container.querySelector('input[name="email"]') as HTMLInputElement, "contact@acme.com");
    setInputValue(container.querySelector('input[name="phone"]') as HTMLInputElement, "555-0100");

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
      createElement(CustomerEdit),
      `/customer/${PUBLIC_ID}/edit`,
      "/customer/:publicId/edit",
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
      createElement(CustomerView),
      `/customer/${PUBLIC_ID}`,
      "/customer/:publicId",
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
