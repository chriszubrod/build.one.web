import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AssetView from "./AssetView";
import type { AssetWithQbo } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ASSET_ID = "asset-1";

const mockGetList = vi.fn();
const mockGetOne = vi.fn();

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  uploadFile: vi.fn(),
  fetchViewAttachmentBlob: vi.fn(),
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

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: {
      is_admin: true,
      modules: [],
      auth: { public_id: "a", username: "admin" },
      user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
      role: null,
      accessible_project_ids: [],
    },
    isLoading: false,
  }),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function sampleAsset(overrides: Partial<AssetWithQbo> = {}): AssetWithQbo {
  return {
    public_id: ASSET_ID,
    row_version: "rv-1",
    name: "Company truck",
    asset_type: "vehicle",
    make: "Ford",
    model: "F-150",
    model_year: 2022,
    serial_number: "VIN123",
    status: "active",
    acquisition_date: "2022-01-15",
    disposal_date: null,
    qbo_fixed_asset_account_id: "55",
    qbo_accum_dep_account_id: "56",
    fixed_asset_account_name: "Trucks",
    fixed_asset_account_balance: "50000.00",
    accum_dep_account_name: "Accum - Trucks",
    accum_dep_account_balance: "-10000.00",
    ...overrides,
  };
}

let lastContainer: HTMLDivElement;
let lastRoot: Root | null = null;

async function waitForCondition(check: () => boolean) {
  for (let i = 0; i < 50; i++) {
    await act(async () => {
      await Promise.resolve();
    });
    if (check()) return;
  }
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  lastContainer = document.createElement("div");
  document.body.appendChild(lastContainer);
  lastRoot = createRoot(lastContainer);
  act(() => {
    lastRoot!.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          { initialEntries: [`/asset/${ASSET_ID}`] },
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/asset/:publicId", element: createElement(AssetView) }),
          ),
        ),
      ),
    );
  });
}

beforeEach(() => {
  mockGetList.mockReset();
  mockGetOne.mockReset();
  mockGetOne.mockImplementation((path: string) => {
    if (path === `/api/v1/get/asset/${ASSET_ID}`) {
      return Promise.resolve(sampleAsset());
    }
    return Promise.reject(new Error(`unexpected getOne ${path}`));
  });
  mockGetList.mockImplementation((path: string) => {
    if (path === `/api/v1/get/asset-financing-notes/${ASSET_ID}`) {
      return Promise.resolve({ data: [], count: 0 });
    }
    if (path === `/api/v1/get/asset-attachments/${ASSET_ID}`) {
      return Promise.resolve({ data: [], count: 0 });
    }
    return Promise.reject(new Error(`unexpected getList ${path}`));
  });
});

afterEach(() => {
  act(() => {
    lastRoot?.unmount();
  });
  lastRoot = null;
  lastContainer?.remove();
});

describe("AssetView", () => {
  it("renders zero QBO balance as $0.00, not a blank", async () => {
    mockGetOne.mockImplementation((path: string) => {
      if (path === `/api/v1/get/asset/${ASSET_ID}`) {
        return Promise.resolve(
          sampleAsset({
            fixed_asset_account_balance: "0",
            accum_dep_account_balance: "0",
          }),
        );
      }
      return Promise.reject(new Error(`unexpected getOne ${path}`));
    });
    renderView();
    await waitForCondition(() => (lastContainer.textContent ?? "").includes("$0.00"));
    expect(lastContainer.textContent).toContain("$0.00");
    expect(lastContainer.textContent).toContain("Live QBO balances");
  });

  it("lists financing notes and empty documents state", async () => {
    mockGetList.mockImplementation((path: string) => {
      if (path === `/api/v1/get/asset-financing-notes/${ASSET_ID}`) {
        return Promise.resolve({
          data: [
            {
              public_id: "note-1",
              row_version: "rv",
              asset_id: 1,
              qbo_liability_account_id: "200",
            },
          ],
          count: 1,
        });
      }
      if (path === `/api/v1/get/asset-attachments/${ASSET_ID}`) {
        return Promise.resolve({ data: [], count: 0 });
      }
      return Promise.reject(new Error(`unexpected getList ${path}`));
    });
    renderView();
    await waitForCondition(() => (lastContainer.textContent ?? "").includes("200"));
    expect(lastContainer.textContent).toContain("200");
    expect(lastContainer.textContent).toContain("No documents attached");
  });
});
