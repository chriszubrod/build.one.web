import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import VendorCreate from "./VendorCreate";
import VendorEdit from "./VendorEdit";
import VendorView from "./VendorView";
import { setInputValue } from "../../__testutils__/domEvents";
import { flushUntil } from "../../__testutils__/flush";
import type { Vendor } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_ID = "abc123";
const LIST_PATH = "/api/v1/get/vendors";
const ITEM_PATH = `/api/v1/get/vendor/${PUBLIC_ID}`;

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

vi.mock("../../hooks/useLookups", () => ({
  useLookups: () => ({ data: {}, loading: false }),
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

function sampleVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 1,
    public_id: PUBLIC_ID,
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    name: "Acme Supply",
    abbreviation: "ACME",
    taxpayer_id: null,
    vendor_type_id: null,
    is_draft: false,
    is_deleted: false,
    is_contract_labor: false,
    notes: null,
    hourly_rate: null,
    markup: null,
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
  mockCreateEntity.mockResolvedValue(sampleVendor());
  mockUpdateEntity.mockResolvedValue(undefined);
  mockDeleteEntity.mockResolvedValue(undefined);
  mockInvalidateEntity.mockResolvedValue(undefined);
  mockRemoveEntity.mockResolvedValue(undefined);
  mockInvalidateLookups.mockResolvedValue(undefined);
  mockUseEntityItem.mockReturnValue({
    item: sampleVendor(),
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

describe("vendor cache invalidation", () => {
  it("create invalidates list and lookups", async () => {
    renderPage(createElement(VendorCreate), "/vendor/create", "/vendor/create");

    const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement;
    setInputValue(nameInput, "Acme Supply");

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
      createElement(VendorEdit),
      `/vendor/${PUBLIC_ID}/edit`,
      "/vendor/:publicId/edit",
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
      createElement(VendorView),
      `/vendor/${PUBLIC_ID}`,
      "/vendor/:publicId",
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
