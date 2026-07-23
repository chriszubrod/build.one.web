import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BillCreditEdit from "./BillCreditEdit";
import { Modules } from "../../shared/modules";
import type { BillCredit, CurrentUser, CurrentUserModule } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BILL_CREDIT_GET_PATH = "/api/v1/get/bill-credit/bc-1";

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
  del: (...args: unknown[]) => mockDel(...args),
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

vi.mock("../../hooks/useLookups", () => ({
  useLookups: () => ({
    data: { vendors: [] },
    loading: false,
  }),
}));

vi.mock("../../components/ReviewTimeline", () => ({
  default: () => null,
}));

vi.mock("../../components/LineItemAttachment", () => ({
  default: () => null,
}));

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

function sampleBillCredit(overrides: Partial<BillCredit> = {}): BillCredit {
  return {
    id: 1,
    public_id: "bc-1",
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    vendor_id: 1,
    credit_date: "2026-01-15",
    credit_number: "BC-100",
    total_amount: "100.00",
    memo: "",
    is_draft: true,
    ...overrides,
  };
}

const defaultLineItemsResponse = {
  data: [
    {
      public_id: "li-a",
      row_version: "rv-li-a",
      description: "Line A",
      sub_cost_code_id: null,
      quantity: null,
      unit_price: null,
      amount: "10",
      is_billable: true,
      billable_amount: null,
    },
    {
      public_id: "li-b",
      row_version: "rv-li-b",
      description: "Line B",
      sub_cost_code_id: null,
      quantity: null,
      unit_price: null,
      amount: "20",
      is_billable: true,
      billable_amount: null,
    },
  ],
  count: 2,
};

function renderBillCreditEdit(root: Root) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/bill-credit/bc-1/edit"] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/bill-credit/:publicId/edit",
              element: createElement(BillCreditEdit),
            }),
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

async function waitForCondition(check: () => boolean) {
  await act(async () => {
    for (let i = 0; i < 50; i++) {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      if (check()) return;
    }
  });
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });

  mockGetOne.mockImplementation((path: string) => {
    if (path === BILL_CREDIT_GET_PATH) {
      return Promise.resolve(sampleBillCredit({ is_draft: true }));
    }
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  mockGetList.mockResolvedValue(defaultLineItemsResponse);

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

function findSaveButton(container: HTMLDivElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Save",
  ) as HTMLButtonElement | undefined;
}

describe("BillCreditEdit line-item delete tracking", () => {
  beforeEach(() => {
    mockPut.mockImplementation((path: string) => {
      if (path === "/api/v1/update/bill-credit/bc-1") {
        return Promise.resolve(sampleBillCredit({ row_version: "rv-2", is_draft: true }));
      }
      if (path.startsWith("/api/v1/update/bill-credit-line-item/")) {
        return Promise.resolve({
          public_id: path.split("/").pop(),
          row_version: "rv-li-upd",
        });
      }
      return Promise.reject(new Error("unexpected put: " + path));
    });

    mockDel.mockResolvedValue({});
  });

  const removeButton = () => container.querySelector('button[title="Remove"]');

  async function waitForLineItems() {
    await waitForCondition(() => removeButton() !== null);
    expect(removeButton()).not.toBeNull();
  }

  it("issues DELETE for a line item removed after load on save", async () => {
    renderBillCreditEdit(root);
    await waitForLineItems();
    await flushMicrotasks();

    await act(async () => {
      const removeBtn = removeButton();
      expect(removeBtn).not.toBeNull();
      removeBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushMicrotasks();
    });

    const saveBtn = findSaveButton(container);
    expect(saveBtn).toBeDefined();
    await act(async () => {
      saveBtn!.click();
      await flushMicrotasks();
    });

    expect(mockDel).toHaveBeenCalledWith("/api/v1/delete/bill-credit-line-item/li-a");
  });

  it("issues DELETE for a line item removed after a prior successful save", async () => {
    renderBillCreditEdit(root);
    await waitForLineItems();
    await flushMicrotasks();

    const firstSave = findSaveButton(container);
    expect(firstSave).toBeDefined();
    await act(async () => {
      firstSave!.click();
      await flushMicrotasks();
    });

    expect(mockDel).not.toHaveBeenCalled();

    await act(async () => {
      const removeBtn = removeButton();
      expect(removeBtn).not.toBeNull();
      removeBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushMicrotasks();
    });

    mockDel.mockClear();

    const secondSave = findSaveButton(container);
    expect(secondSave).toBeDefined();
    await act(async () => {
      secondSave!.click();
      await flushMicrotasks();
    });

    expect(mockDel).toHaveBeenCalledWith("/api/v1/delete/bill-credit-line-item/li-a");
  });
});

describe("BillCreditEdit permissions", () => {
  it("refuse-renders without can_update", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: {
        ...adminUser(),
        is_admin: false,
        modules: [makeModule(Modules.BILL_CREDITS, { can_read: true, can_update: false })],
      },
      isLoading: false,
    });

    renderBillCreditEdit(root);
    await flushMicrotasks();
    await waitForCondition(() =>
      container.textContent?.includes("don't have permission to edit this bill credit") ?? false,
    );

    expect(container.textContent).toContain("don't have permission to edit this bill credit");
    expect(findSaveButton(container)).toBeUndefined();
  });

  it("hides Complete bar without can_complete", async () => {
    mockUseCurrentUser.mockReturnValue({
      data: {
        ...adminUser(),
        is_admin: false,
        modules: [
          makeModule(Modules.BILL_CREDITS, {
            can_read: true,
            can_update: true,
            can_complete: false,
          }),
        ],
      },
      isLoading: false,
    });

    renderBillCreditEdit(root);
    await flushMicrotasks();
    await waitForCondition(() => findSaveButton(container) !== undefined);

    expect(container.textContent).not.toContain("Complete Bill Credit");
  });
});
