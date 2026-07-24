import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OrganizationView from "./OrganizationView";
import OrganizationEdit from "./OrganizationEdit";
import type { CurrentUser, Organization } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORGANIZATION_GET_PATH = "/api/v1/get/organization/abc123";

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

vi.mock("../../api/client", () => ({
  getList: vi.fn(async () => ({ data: [], count: 0 })),
  post: vi.fn(),
  del: vi.fn(),
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
  useEntityList: () => ({ items: [], loading: false, error: "", reload: vi.fn() }),
  updateEntity: vi.fn(),
  deleteEntity: vi.fn(),
  invalidateEntity: vi.fn(),
  removeEntity: vi.fn(),
}));

function sampleOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 1,
    public_id: "abc123",
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    name: "Acme Org",
    website: "https://acme.example",
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });
  mockUseEntityItem.mockReturnValue({
    item: sampleOrganization(),
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
// /api/v1/get/organization/undefined).
describe("organization route param -> fetch path", () => {
  const cases: [string, ComponentType, string, string][] = [
    ["OrganizationView", OrganizationView, "/organization/abc123", "/organization/:publicId"],
    ["OrganizationEdit", OrganizationEdit, "/organization/abc123/edit", "/organization/:publicId/edit"],
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
    expect(mockUseEntityItem).toHaveBeenCalledWith(ORGANIZATION_GET_PATH);
  });
});
