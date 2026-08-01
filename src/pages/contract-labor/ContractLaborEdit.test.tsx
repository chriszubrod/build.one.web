import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ContractLaborEdit from "./ContractLaborEdit";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue } from "../../__testutils__/domEvents";
import type { ContractLabor, ContractLaborLineItem } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_ID = "cl-1";
const CL_PATH = `/api/v1/contract-labor/${PUBLIC_ID}`;
const LINE_ITEMS_PATH = `${CL_PATH}/line-items`;

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: (...args: unknown[]) => mockPost(...args),
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

vi.mock("../../hooks/useEntity", () => ({
  useEntityList: () => ({ items: [], loading: false, error: "", reload: vi.fn() }),
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

vi.mock("../../components/ReviewTimeline", () => ({
  default: () => null,
}));

function sampleEntry(overrides: Partial<ContractLabor> = {}): ContractLabor {
  return {
    id: 1,
    public_id: PUBLIC_ID,
    row_version: "cl-rv-1",
    created_datetime: null,
    modified_datetime: null,
    vendor_id: 1,
    project_id: null,
    employee_name: "Worker",
    job_name: null,
    work_date: "2026-01-15",
    time_in: null,
    time_out: null,
    break_time: null,
    regular_hours: null,
    overtime_hours: null,
    total_hours: "8",
    hourly_rate: null,
    markup: null,
    total_amount: null,
    sub_cost_code_id: null,
    description: null,
    billing_period_start: null,
    status: "draft",
    bill_line_item_id: null,
    bill_vendor_id: null,
    bill_date: null,
    due_date: null,
    bill_number: null,
    import_batch_id: null,
    source_file: null,
    source_row: null,
    source_time_entry_public_id: null,
    ...overrides,
  };
}

function setupMocks() {
  mockGetOne.mockImplementation((path: string) => {
    if (path === CL_PATH) return Promise.resolve(sampleEntry());
    // Summary values feed only the hours tiles / allocation banner, which no
    // assertion here reads; the page's `?? 0` fallbacks cover the empty shape.
    if (path === `${CL_PATH}/daily-summary`) return Promise.resolve({});
    if (path === "/api/v1/contract-labor/vendor-config") return Promise.resolve({});
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  mockGetList.mockImplementation((path: string) => {
    if (path === LINE_ITEMS_PATH) {
      return Promise.resolve({ data: [] as ContractLaborLineItem[], count: 0 });
    }
    return Promise.reject(new Error(`unexpected getList: ${path}`));
  });

  mockPut.mockImplementation((path: string) => {
    if (path === `${CL_PATH}/bill`) {
      return Promise.resolve({ public_id: PUBLIC_ID, row_version: "cl-rv-2" });
    }
    return Promise.reject(new Error(`unexpected put: ${path}`));
  });

  mockPost.mockRejectedValue(new Error("unexpected post"));
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function renderEdit() {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [`/contract-labor/${PUBLIC_ID}/edit`] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/contract-labor/:publicId/edit",
              element: createElement(ContractLaborEdit),
            }),
          ),
        ),
      ),
    );
  });
}

/** Throws on miss — for use in assertions, never as a flushUntil predicate. */
function labeledInput(label: string): HTMLInputElement {
  const card = container.querySelector(".cl-line-item-card");
  if (!card) throw new Error("line-item card not rendered");
  for (const el of card.querySelectorAll("label")) {
    if (el.textContent?.trim() === label) {
      const input = el.parentElement?.querySelector("input");
      if (!input) throw new Error(`no input under label: ${label}`);
      return input as HTMLInputElement;
    }
  }
  throw new Error(`input not found for label: ${label}`);
}

function saveChangesButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === "Save Changes",
  );
}

/** The predicate must be able to report "not yet" rather than throw — an
 *  asserting lookup here would collapse the flush to a single-shot check and
 *  die instead of waiting, and would make the hard assertion below
 *  unfailable (U-152). */
async function waitForLineForm() {
  await flushUntil(() => container.querySelector(".cl-line-item-card") !== null);
  expect(container.querySelector(".cl-line-item-card")).toBeTruthy();
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetList.mockReset();
  mockGetOne.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setupMocks();

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

describe("ContractLaborEdit save payload (U-185)", () => {
  it("rounds half-cent line price away from zero on Save Changes PUT", async () => {
    renderEdit();
    await waitForLineForm();

    await act(async () => {
      setInputValue(labeledInput("Hours"), "1");
      setInputValue(labeledInput("Rate (per hour)"), "1");
      setInputValue(labeledInput("Markup (%)"), "0.5");
    });
    // Prove the typing reached component state before relying on it — the
    // computed price is only 1.005 if all three landed.
    expect(labeledInput("Hours").value).toBe("1");
    expect(labeledInput("Rate (per hour)").value).toBe("1");
    expect(labeledInput("Markup (%)").value).toBe("0.5");

    mockPut.mockClear();

    const btn = saveChangesButton();
    expect(btn, "Save Changes button not rendered").toBeDefined();
    await act(async () => {
      btn!.click();
    });

    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === `${CL_PATH}/bill`));
    const call = mockPut.mock.calls.find((c) => c[0] === `${CL_PATH}/bill`);
    expect(call, "Save Changes did not PUT the bill endpoint").toBeDefined();

    const body = call![1] as { line_items: { price: number }[] };
    expect(body.line_items[0].price).toBe(1.01);
  });
});
