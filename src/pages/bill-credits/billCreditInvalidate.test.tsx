import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import BillCreditCreate from "./BillCreditCreate";
import BillCreditEdit from "./BillCreditEdit";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue } from "../../__testutils__/domEvents";
import type { BillCredit, CurrentUser } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_ID = "abc123";
const LIST_PATH = "/api/v1/get/bill-credits";
const ITEM_PATH = `/api/v1/get/bill-credit/${PUBLIC_ID}`;

const mockNavigate = vi.fn();
const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();
const mockInvalidateEntity = vi.fn();
const mockRemoveEntity = vi.fn();
const mockUseEntityItem = vi.fn();

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
    data: {
      vendors: [{ public_id: "v-1", id: 1, name: "Acme Vendor" }],
    },
    loading: false,
  }),
}));

vi.mock("../../components/ReviewTimeline", () => ({
  default: () => null,
}));

vi.mock("../../components/LineItemAttachment", () => ({
  default: () => null,
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

vi.mock("../../hooks/useEntity", () => ({
  useEntityItem: (path: string) => mockUseEntityItem(path),
  invalidateEntity: (...args: unknown[]) => mockInvalidateEntity(...args),
  removeEntity: (...args: unknown[]) => mockRemoveEntity(...args),
}));

function sampleBillCredit(overrides: Partial<BillCredit> = {}): BillCredit {
  return {
    id: 1,
    public_id: PUBLIC_ID,
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
  mockUseCurrentUser.mockReturnValue({ data: adminUser(), isLoading: false });
  mockPost.mockResolvedValue(sampleBillCredit());
  mockPut.mockImplementation((path: string) => {
    if (path === `/api/v1/update/bill-credit/${PUBLIC_ID}`) {
      return Promise.resolve(sampleBillCredit({ row_version: "rv-2" }));
    }
    if (path.startsWith("/api/v1/update/bill-credit-line-item/")) {
      return Promise.resolve({
        public_id: path.split("/").pop(),
        row_version: "rv-li-upd",
      });
    }
    return Promise.reject(new Error(`unexpected put: ${path}`));
  });
  mockDel.mockResolvedValue({});
  mockGetList.mockResolvedValue({ data: [], count: 0 });
  mockInvalidateEntity.mockResolvedValue(undefined);
  mockRemoveEntity.mockResolvedValue(undefined);
  mockUseEntityItem.mockReturnValue({
    item: sampleBillCredit(),
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

describe("bill-credit cache invalidation", () => {
  it("create invalidates list only", async () => {
    renderPage(createElement(BillCreditCreate), "/bill-credit/create", "/bill-credit/create");

    const vendorSelect = container.querySelector("#vendor_public_id") as HTMLSelectElement;
    const creditNumberInput = container.querySelector("#credit_number") as HTMLInputElement;
    const creditDateInput = container.querySelector("#credit_date") as HTMLInputElement;
    expect(vendorSelect).toBeTruthy();
    expect(creditNumberInput).toBeTruthy();
    expect(creditDateInput).toBeTruthy();

    await act(async () => {
      // <select> has no shared helper (setInputValue is typed for HTMLInputElement).
      vendorSelect.value = "v-1";
      vendorSelect.dispatchEvent(new Event("change", { bubbles: true }));
      // Inputs MUST go through setInputValue: a raw `.value =` also updates React's
      // _valueTracker, so onChange is suppressed and the value never reaches state
      // — the spec would then be reading back its own DOM write (U-152).
      setInputValue(creditNumberInput, "BC-NEW");
      setInputValue(creditDateInput, "2026-01-15");
    });

    const form = container.querySelector("form");
    expect(form).toBeTruthy();

    await act(async () => {
      form!.requestSubmit();
    });

    await flushUntil(() => mockInvalidateEntity.mock.calls.length > 0);

    expect(mockInvalidateEntity).toHaveBeenCalledWith(expect.anything(), { listPath: LIST_PATH });
  });

  it("edit invalidates list and item", async () => {
    renderPage(
      createElement(BillCreditEdit),
      `/bill-credit/${PUBLIC_ID}/edit`,
      "/bill-credit/:publicId/edit",
    );

    await flushUntil(() => container.querySelector('button[type="submit"]') !== null);

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Save",
    ) as HTMLButtonElement;
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton.click();
    });

    await flushUntil(() => mockInvalidateEntity.mock.calls.length > 0);

    expect(mockInvalidateEntity).toHaveBeenCalledWith(expect.anything(), {
      listPath: LIST_PATH,
      itemPath: ITEM_PATH,
    });
  });

  it("complete invalidates list and item after the completion POST", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));

    const events: string[] = [];
    mockInvalidateEntity.mockImplementation(async () => {
      events.push("invalidate");
    });
    mockPost.mockImplementation(async (path: string) => {
      if (path === `/api/v1/complete/bill-credit/${PUBLIC_ID}`) {
        events.push("complete");
        return {};
      }
      return sampleBillCredit();
    });

    renderPage(
      createElement(BillCreditEdit),
      `/bill-credit/${PUBLIC_ID}/edit`,
      "/bill-credit/:publicId/edit",
    );

    await flushUntil(() => container.querySelector("button.btn-success") !== null);

    const completeButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Complete Bill Credit",
    ) as HTMLButtonElement;
    expect(completeButton).toBeTruthy();

    await act(async () => {
      completeButton.click();
    });

    await flushUntil(
      () =>
        events.includes("complete") &&
        events.filter((e) => e === "invalidate").length >= 2,
    );

    expect(mockPost).toHaveBeenCalledWith(`/api/v1/complete/bill-credit/${PUBLIC_ID}`, {});
    expect(mockInvalidateEntity.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(events.indexOf("complete")).toBeLessThan(events.lastIndexOf("invalidate"));
    expect(mockInvalidateEntity).toHaveBeenCalledWith(expect.anything(), {
      listPath: LIST_PATH,
      itemPath: ITEM_PATH,
    });

    vi.unstubAllGlobals();
  });
});
