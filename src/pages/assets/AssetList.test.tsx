import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AssetList from "./AssetList";
import type { Asset } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetList = vi.fn();

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
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

function sampleAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    public_id: "asset-1",
    row_version: "rv-1",
    name: "Forklift",
    asset_type: "equipment",
    make: "Toyota",
    model: "8FGU25",
    model_year: 2020,
    serial_number: "SN-100",
    status: "active",
    acquisition_date: null,
    disposal_date: null,
    qbo_fixed_asset_account_id: "101",
    qbo_accum_dep_account_id: null,
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

function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  lastContainer = document.createElement("div");
  document.body.appendChild(lastContainer);
  lastRoot = createRoot(lastContainer);
  act(() => {
    lastRoot!.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(AssetList)),
      ),
    );
  });
}

beforeEach(() => {
  mockGetList.mockReset();
  mockGetList.mockResolvedValue({ data: [], count: 0 });
});

afterEach(() => {
  act(() => {
    lastRoot?.unmount();
  });
  lastRoot = null;
  lastContainer?.remove();
});

describe("AssetList", () => {
  it("renders empty state when there are no assets", async () => {
    renderList();
    await waitForCondition(() =>
      (lastContainer.textContent ?? "").includes("No assets yet"),
    );
    expect(lastContainer.textContent).toContain("No assets yet");
  });

  it("filters by status and type client-side", async () => {
    mockGetList.mockResolvedValue({
      data: [
        sampleAsset({ public_id: "a1", name: "Truck", asset_type: "vehicle", status: "active" }),
        sampleAsset({
          public_id: "a2",
          name: "Old press",
          asset_type: "machinery",
          status: "disposed",
        }),
      ],
      count: 2,
    });
    renderList();
    await waitForCondition(() => (lastContainer.textContent ?? "").includes("Truck"));
    expect(lastContainer.textContent).toContain("Truck");
    expect(lastContainer.textContent).toContain("Old press");

    const statusSelect = lastContainer.querySelector(
      'select[class="inline-li-input"]',
    ) as HTMLSelectElement;
    await act(async () => {
      statusSelect.value = "disposed";
      statusSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(lastContainer.textContent).toContain("Old press");
    expect(lastContainer.textContent).not.toContain("Truck");
  });
});
