import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AddressView from "./AddressView";
import AddressEdit from "./AddressEdit";
import type { CurrentUser, Address } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS_GET_PATH = "/api/v1/get/address/abc123";

const mockNavigate = vi.fn();

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

const mockUseEntityItem = vi.fn();

vi.mock("../../hooks/useEntity", () => ({
  useEntityItem: (path: string) => mockUseEntityItem(path),
  updateEntity: vi.fn(),
  deleteEntity: vi.fn(),
  invalidateEntity: vi.fn(),
  removeEntity: vi.fn(),
}));

function sampleAddress(overrides: Partial<Address> = {}): Address {
  return {
    id: 1,
    public_id: "abc123",
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    street_one: "123 Main St",
    street_two: null,
    city: "Austin",
    state: "TX",
    zip: "78701",
    country: { name: "United States", abbreviation: "US" },
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });
  mockUseEntityItem.mockReturnValue({
    item: sampleAddress(),
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
});

// Guards both pages against regressing to a useParams name the route does not
// provide (the pages read :publicId; a rename back to `id` would fetch
// /api/v1/get/address/undefined).
describe("address route param -> fetch path", () => {
  const cases: [string, ComponentType, string, string][] = [
    ["AddressView", AddressView, "/address/abc123", "/address/:publicId"],
    ["AddressEdit", AddressEdit, "/address/abc123/edit", "/address/:publicId/edit"],
  ];

  it.each(cases)("%s fetches using publicId from the route", (_name, Component, initialEntry, routePath) => {
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: [initialEntry] },
          createElement(
            QueryClientProvider,
            { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: routePath,
                element: createElement(Component),
              }),
            ),
          ),
        ),
      );
    });
    expect(mockUseEntityItem).toHaveBeenCalledWith(ADDRESS_GET_PATH);
  });
});
