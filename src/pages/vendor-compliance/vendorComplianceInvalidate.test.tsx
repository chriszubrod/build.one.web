import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import VendorEdit from "../vendors/VendorEdit";
import VendorComplianceDashboard from "./VendorComplianceDashboard";
import { entityItemKey } from "../../hooks/useEntity";
import { flushUntil } from "../../__testutils__/flush";
import type {
  CurrentUser,
  Vendor,
  VendorComplianceDashboard as VendorComplianceDashboardData,
} from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROSTER_VENDOR_ID = "roster-vendor-1";
const SUGGESTION_VENDOR_ID = "suggest-vendor-1";

const mockGetOne = vi.fn();
const mockPut = vi.fn();
let serverRowVersion = "rv-1";

vi.mock("../../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../api/client")>();
  return {
    ...mod,
    getOne: (...args: unknown[]) => mockGetOne(...args),
    put: (...args: unknown[]) => mockPut(...args),
  };
});

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return { ...mod, useNavigate: () => vi.fn() };
});

vi.mock("../../hooks/useLookups", () => ({
  useLookups: () => ({ data: {}, loading: false }),
}));

vi.mock("../../components/InlineContacts", () => ({
  default: () => null,
}));

function nonAdminUser(): CurrentUser {
  return {
    is_admin: false,
    modules: [],
    auth: { public_id: "a", username: "user" },
    user: { id: 1, public_id: "u", firstname: "T", lastname: "U" },
    role: null,
    accessible_project_ids: [],
  };
}

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ data: nonAdminUser(), isLoading: false }),
}));

function vendor(publicId: string, rv: string): Vendor {
  return {
    id: 1,
    public_id: publicId,
    row_version: rv,
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
  };
}

function sampleDashboard(): VendorComplianceDashboardData {
  return {
    roster: [
      {
        vendor_public_id: ROSTER_VENDOR_ID,
        vendor_name: "Tracked Vendor",
        vendor_abbreviation: "TV",
        slots: {
          BUSINESS_LICENSE: { status: "missing" },
          CONTRACTORS_LICENSE: { status: "missing" },
          CERTIFICATE_OF_INSURANCE: { status: "missing" },
          W9: { status: "missing" },
        },
      },
    ],
    suggestions: [
      {
        vendor_public_id: SUGGESTION_VENDOR_ID,
        vendor_name: "Suggested Vendor",
        vendor_type: "Tradesman",
      },
    ],
  };
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function itemPath(publicId: string) {
  return `/api/v1/get/vendor/${publicId}`;
}

function mountRoute(
  routePath: string,
  entry: string,
  element: ReturnType<typeof createElement>,
) {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(Routes, null, createElement(Route, { path: routePath, element })),
        ),
      ),
    );
  });
}

function mountEdit(publicId: string) {
  mountRoute(
    "/vendor/:publicId/edit",
    `/vendor/${publicId}/edit`,
    createElement(VendorEdit),
  );
}

function mountDashboard() {
  mountRoute(
    "/vendor-compliance",
    "/vendor-compliance",
    createElement(VendorComplianceDashboard),
  );
}

/** Find a button by its exact label — a real element check, not a textContent substring. */
function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (btn) => btn.textContent === label,
  ) as HTMLButtonElement | undefined;
}

function unmountAll() {
  act(() => {
    root.render(createElement("div"));
  });
}

/** Warm the item cache the real way: mount VendorEdit at rv-1, then leave. */
async function warmCacheAtRv1(publicId: string) {
  serverRowVersion = "rv-1";
  mountEdit(publicId);
  await flushUntil(() => !!container.querySelector("form"));
  expect(container.querySelector("form")).toBeTruthy();
  expect(
    (queryClient.getQueryData(entityItemKey(itemPath(publicId))) as Vendor).row_version,
  ).toBe("rv-1");
  unmountAll();
}

/** Remount VendorEdit, save, return the row_version that hit the API. */
async function remountAndSave(publicId: string): Promise<string> {
  mockPut.mockClear();
  mountEdit(publicId);
  await flushUntil(() => !!container.querySelector("form"));
  const form = container.querySelector("form");
  expect(form).toBeTruthy();
  await act(async () => {
    form!.requestSubmit();
  });
  await flushUntil(() => mockPut.mock.calls.length > 0);
  return (mockPut.mock.calls[0]?.[1] as { row_version: string }).row_version;
}

function togglePutReturnsUpdated(publicId: string) {
  mockPut.mockImplementation(async (path: string) => {
    if (path === `/api/v1/update/vendor/${publicId}`) {
      serverRowVersion = "rv-2";
      return vendor(publicId, "rv-2");
    }
    return vendor(publicId, serverRowVersion);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  serverRowVersion = "rv-1";
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 5 * 60 * 1000,
        gcTime: 24 * 60 * 60 * 1000,
      },
    },
  });
  mockGetOne.mockImplementation((path: string) => {
    if (path === "/api/v1/get/vendor-compliance/dashboard") {
      return Promise.resolve(sampleDashboard());
    }
    const vendorMatch = /^\/api\/v1\/get\/vendor\/(.+)$/.exec(path);
    if (vendorMatch) {
      return Promise.resolve(vendor(vendorMatch[1], serverRowVersion));
    }
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });
  mockPut.mockResolvedValue(undefined);

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

describe("vendor compliance item cache after track toggle", () => {
  it.each([
    { action: "unflag", vendorId: ROSTER_VENDOR_ID, label: "Unflag" },
    { action: "track", vendorId: SUGGESTION_VENDOR_ID, label: "Track" },
  ])(
    "$action leaves the vendor item cache fresh enough for VendorEdit to save",
    async ({ vendorId, label }) => {
      await warmCacheAtRv1(vendorId);

      togglePutReturnsUpdated(vendorId);
      mountDashboard();
      await flushUntil(() => findButton(label) != null);
      const button = findButton(label);
      expect(button).toBeTruthy();

      await act(async () => {
        button!.click();
      });
      // Gate on the reconciliation having landed, not merely on the PUT being issued —
      // the latter is true before the response resolves, so it would not be load-bearing.
      await flushUntil(
        () =>
          (queryClient.getQueryData(entityItemKey(itemPath(vendorId))) as Vendor | undefined)
            ?.row_version === "rv-2",
      );
      unmountAll();

      const submitted = await remountAndSave(vendorId);
      expect(submitted).toBe("rv-2");
    },
  );
});
