import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, Fragment, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";
import AddressEdit from "./AddressEdit";
import { assertGuardSurvivesSameRowRefetch } from "../../__testutils__/formSeedGuardHarness";
import { flushUntil as waitForCondition } from "../../__testutils__/flush";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule, Address } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// One literal, referenced by both permission specs. The deny spec asserts it is
// PRESENT and the allow spec asserts it is ABSENT; sharing the const means a
// drift in the component's copy turns the deny spec RED instead of leaving the
// absent-assertion passing vacuously forever.
const DENIED_COPY = "You do not have permission to edit this address.";

const ADDRESS_A_GET_PATH = "/api/v1/get/address/rv-addr-a";
const ADDRESS_B_GET_PATH = "/api/v1/get/address/rv-addr-b";

const mockGetOne = vi.fn();
const mockPut = vi.fn();

vi.mock("../../api/client", () => ({
  getList: vi.fn(),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: vi.fn(),
  put: (...args: unknown[]) => mockPut(...args),
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

const mockUseCurrentUser = vi.fn(() => ({
  data: adminUser(),
  isLoading: false,
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockUseCurrentUser(),
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

function makeModule(
  name: string,
  perms: Partial<CurrentUserModule> = {},
): CurrentUserModule {
  return {
    public_id: `mod-${name}`,
    name,
    route: null,
    can_create: false,
    can_read: false,
    can_update: false,
    can_delete: false,
    can_submit: false,
    can_approve: false,
    can_complete: false,
    can_view_team: false,
    ...perms,
  };
}

function sampleAddress(overrides: Partial<Address> = {}): Address {
  return {
    id: 1,
    public_id: "rv-addr-a",
    row_version: "rv-a",
    created_datetime: null,
    modified_datetime: null,
    street_one: "street A",
    street_two: null,
    city: "city A",
    state: "TX",
    zip: "78701",
    country: { name: "United States", abbreviation: "US" },
    ...overrides,
  };
}

let doNavigate: NavigateFunction;

function NavCapture() {
  const navigate = useNavigate();
  // Assigning during render trips react-hooks/globals; capture in an effect.
  useEffect(() => {
    doNavigate = navigate;
  });
  return null;
}

function renderAddressEdit(root: Root) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/address/rv-addr-a/edit"] },
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            Fragment,
            null,
            createElement(NavCapture),
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: "/address/:publicId/edit",
                element: createElement(AddressEdit),
              }),
            ),
          ),
        ),
      ),
    );
  });
}

async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 40; i++) {
      await Promise.resolve();
    }
  });
}

function streetOneInput(): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>("#street_one");
}

function cityInput(): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>("#city");
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });

  mockGetOne.mockImplementation((path: string) => {
    if (path === ADDRESS_A_GET_PATH) {
      return Promise.resolve(sampleAddress());
    }
    if (path === ADDRESS_B_GET_PATH) {
      return Promise.resolve(
        sampleAddress({
          id: 2,
          public_id: "rv-addr-b",
          row_version: "rv-b",
          street_one: "street B",
          city: "city B",
        }),
      );
    }
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
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

describe("AddressEdit form re-seed on route param change (U-157)", () => {
  // Both fixtures share zip "78701" and differ only on city, so the
  // seeded-row gate has to read city — waiting on street_one would be
  // satisfied by either row and would not prove WHICH row seeded the form.
  async function waitForRow(city: string) {
    await waitForCondition(() => cityInput()?.value === city);
    expect(cityInput()?.value).toBe(city);
  }

  async function navigateToRowB() {
    await act(async () => {
      doNavigate("/address/rv-addr-b/edit");
    });
    await flushMicrotasks();
  }

  it("re-seeds form fields when publicId changes", async () => {
    renderAddressEdit(root);
    await flushMicrotasks();
    await waitForRow("city A");

    await navigateToRowB();
    await waitForRow("city B");
  });

  it("submits row B row_version after navigating from row A", async () => {
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/address/rv-addr-b") {
        return Promise.resolve(
          sampleAddress({
            public_id: "rv-addr-b",
            row_version: "rv-b-upd",
            street_one: "street B",
            city: "city B",
          }),
        );
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    renderAddressEdit(root);
    await flushMicrotasks();
    await waitForRow("city A");
    await navigateToRowB();
    await waitForRow("city B");

    const form = container.querySelector("form.form-card") as HTMLFormElement;
    expect(form).not.toBeNull();

    await act(async () => {
      form.requestSubmit();
      await flushMicrotasks();
    });

    expect(mockPut).toHaveBeenCalledWith(
      "/api/v1/update/address/rv-addr-b",
      expect.objectContaining({ row_version: "rv-b" }),
    );
    expect(mockPut).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ row_version: "rv-a" }),
    );
  });

  it("does not clobber in-progress edits on same-publicId background refetch", async () => {
    await assertGuardSurvivesSameRowRefetch({
      container,
      root,
      component: createElement(AddressEdit),
      routePath: "/address/:publicId/edit",
      initialEntry: "/address/rv-addr-a/edit",
      itemPath: ADDRESS_A_GET_PATH,
      mockGetOne,
      fieldSelector: "#street_one",
      seededValue: "street A",
      editedValue: "user edited street",
      refreshedRow: sampleAddress({
        row_version: "rv-a-refreshed",
        street_one: "server refreshed street",
        city: "server refreshed city",
      }),
      untouched: { selector: "#city", expected: "city A" },
    });
  });

  it("refuse-renders the form for a can_read-only user (gate is can_update, not can_read)", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: {
        ...adminUser(),
        is_admin: false,
        modules: [makeModule(Modules.VENDORS, { can_read: true, can_update: false })],
      },
      isLoading: false,
    });

    renderAddressEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => container.textContent?.includes(DENIED_COPY) ?? false);

    expect(container.textContent).toContain(DENIED_COPY);
    expect(streetOneInput()).toBeNull();
  });

  it("renders the form for a non-admin with can_update", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: {
        ...adminUser(),
        is_admin: false,
        modules: [makeModule(Modules.VENDORS, { can_read: true, can_update: true })],
      },
      isLoading: false,
    });

    renderAddressEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => streetOneInput() !== null);

    expect(streetOneInput()).not.toBeNull();
    expect(container.textContent).not.toContain(DENIED_COPY);
  });
});
