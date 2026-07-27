import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement, Fragment, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";
import ReviewStatusEdit from "./ReviewStatusEdit";
import { assertGuardSurvivesSameRowRefetch } from "../../__testutils__/formSeedGuardHarness";
import { flushUntil as waitForCondition } from "../../__testutils__/flush";
import { Modules } from "../../shared/modules";
import type { CurrentUser, CurrentUserModule, ReviewStatus } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// One literal, referenced by both permission specs. The deny spec asserts it is
// PRESENT and the allow spec asserts it is ABSENT; sharing the const means a
// drift in the component's copy turns the deny spec RED instead of leaving the
// absent-assertion passing vacuously forever.
const DENIED_COPY = "You do not have permission to edit this review status.";

const REVIEW_STATUS_A_GET_PATH = "/api/v1/get/review-status/rv-status-a";
const REVIEW_STATUS_B_GET_PATH = "/api/v1/get/review-status/rv-status-b";

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

function sampleReviewStatus(overrides: Partial<ReviewStatus> = {}): ReviewStatus {
  return {
    id: 1,
    public_id: "rv-status-a",
    row_version: "rv-a",
    created_datetime: null,
    modified_datetime: null,
    name: "row",
    description: "desc A",
    sort_order: 1,
    is_final: false,
    is_declined: false,
    is_active: true,
    color: null,
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

function renderReviewStatusEdit(root: Root) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/review-status/rv-status-a/edit"] },
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
                path: "/review-status/:publicId/edit",
                element: createElement(ReviewStatusEdit),
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

function nameInput(): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>("#name");
}

function descriptionInput(): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>("#description");
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });

  mockGetOne.mockImplementation((path: string) => {
    if (path === REVIEW_STATUS_A_GET_PATH) {
      return Promise.resolve(sampleReviewStatus());
    }
    if (path === REVIEW_STATUS_B_GET_PATH) {
      return Promise.resolve(
        sampleReviewStatus({
          id: 2,
          public_id: "rv-status-b",
          row_version: "rv-b",
          name: "row",
          description: "desc B",
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

describe("ReviewStatusEdit form re-seed on route param change (U-155)", () => {
  // Both fixtures share name "row" and differ only on description, so the
  // seeded-row gate has to read description — waiting on name would be
  // satisfied by either row and would not prove WHICH row seeded the form.
  async function waitForRow(description: string) {
    await waitForCondition(() => descriptionInput()?.value === description);
    expect(descriptionInput()?.value).toBe(description);
  }

  async function navigateToRowB() {
    await act(async () => {
      doNavigate("/review-status/rv-status-b/edit");
    });
    await flushMicrotasks();
  }

  it("re-seeds form fields when publicId changes", async () => {
    renderReviewStatusEdit(root);
    await flushMicrotasks();
    await waitForRow("desc A");

    await navigateToRowB();
    await waitForRow("desc B");
  });

  it("submits row B row_version after navigating from row A", async () => {
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/review-status/rv-status-b") {
        return Promise.resolve(
          sampleReviewStatus({
            public_id: "rv-status-b",
            row_version: "rv-b-upd",
            name: "row",
            description: "desc B",
          }),
        );
      }
      return Promise.reject(new Error(`unexpected put: ${path}`));
    });

    renderReviewStatusEdit(root);
    await flushMicrotasks();
    await waitForRow("desc A");
    await navigateToRowB();
    await waitForRow("desc B");

    const form = container.querySelector("form.form-card") as HTMLFormElement;
    expect(form).not.toBeNull();

    await act(async () => {
      form.requestSubmit();
      await flushMicrotasks();
    });

    expect(mockPut).toHaveBeenCalledWith(
      "/api/v1/update/review-status/rv-status-b",
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
      component: createElement(ReviewStatusEdit),
      routePath: "/review-status/:publicId/edit",
      initialEntry: "/review-status/rv-status-a/edit",
      itemPath: REVIEW_STATUS_A_GET_PATH,
      mockGetOne,
      fieldSelector: "#name",
      seededValue: "row",
      editedValue: "user edited name",
      refreshedRow: sampleReviewStatus({
        row_version: "rv-a-refreshed",
        name: "server refreshed name",
        description: "server refreshed desc",
      }),
      untouched: { selector: "#description", expected: "desc A" },
    });
  });

  it("refuse-renders the form for a can_read-only user (gate is can_update, not can_read)", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: {
        ...adminUser(),
        is_admin: false,
        modules: [makeModule(Modules.REVIEW_STATUSES, { can_read: true, can_update: false })],
      },
      isLoading: false,
    });

    renderReviewStatusEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => container.textContent?.includes(DENIED_COPY) ?? false);

    expect(container.textContent).toContain(DENIED_COPY);
    expect(nameInput()).toBeNull();
  });

  it("renders the form for a non-admin with can_update", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: {
        ...adminUser(),
        is_admin: false,
        modules: [makeModule(Modules.REVIEW_STATUSES, { can_read: true, can_update: true })],
      },
      isLoading: false,
    });

    renderReviewStatusEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => nameInput() !== null);

    expect(nameInput()).not.toBeNull();
    expect(container.textContent).not.toContain(DENIED_COPY);
  });
});
