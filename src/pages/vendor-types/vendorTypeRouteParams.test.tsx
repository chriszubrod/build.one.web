import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import VendorTypeView from "./VendorTypeView";
import VendorTypeEdit from "./VendorTypeEdit";
import type { CurrentUser, VendorType } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VENDOR_TYPE_GET_PATH = "/api/v1/get/vendor-type/abc123";

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
}));

function sampleVendorType(overrides: Partial<VendorType> = {}): VendorType {
  return {
    id: 1,
    public_id: "abc123",
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    name: "Subcontractor",
    description: "Default type",
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });
  mockUseEntityItem.mockReturnValue({
    item: sampleVendorType(),
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
// /api/v1/get/vendor-type/undefined).
describe("vendor-type route param -> fetch path", () => {
  const cases: [string, ComponentType, string, string][] = [
    ["VendorTypeView", VendorTypeView, "/vendor-type/abc123", "/vendor-type/:publicId"],
    ["VendorTypeEdit", VendorTypeEdit, "/vendor-type/abc123/edit", "/vendor-type/:publicId/edit"],
  ];

  it.each(cases)("%s fetches using publicId from the route", (_name, Component, initialEntry, routePath) => {
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: [initialEntry] },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: routePath,
              element: createElement(Component),
            }),
          ),
        ),
      );
    });
    expect(mockUseEntityItem).toHaveBeenCalledWith(VENDOR_TYPE_GET_PATH);
  });
});
