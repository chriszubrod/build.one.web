import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LaborReviewScreen from "./LaborReviewScreen";
import { flushUntil } from "../../__testutils__/flush";
import { setTextareaValue } from "../../__testutils__/domEvents";
import type { ContractLabor, ContractLaborLineItem } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_ID = "cl-review-1";
const CL_PATH = `/api/v1/contract-labor/${PUBLIC_ID}`;
const LINE_ITEMS_PATH = `${CL_PATH}/line-items`;
const LINE_PUBLIC_ID = "li-half-cent";

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockToast = vi.fn();

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
  post: (...args: unknown[]) => mockPost(...args),
  put: (...args: unknown[]) => mockPut(...args),
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
      projects: [{ id: 1, public_id: "p-1", name: "Project One" }],
      sub_cost_codes: [{ id: 1, public_id: "scc-1", name: "Labor", number: "01" }],
    },
    loading: false,
  }),
}));

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

vi.mock("../../components/ui/NavHeader", () => ({
  default: () => null,
}));

vi.mock("./SubCostCodePickerSheet", () => ({
  default: () => null,
}));

vi.mock("../time-entry/ProjectPickerSheet", () => ({
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
    project_id: 1,
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
    status: "submitted",
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

function sampleLineItem(overrides: Partial<ContractLaborLineItem> = {}): ContractLaborLineItem {
  return {
    id: 10,
    public_id: LINE_PUBLIC_ID,
    row_version: "li-rv-1",
    created_datetime: null,
    modified_datetime: null,
    contract_labor_id: 1,
    bill_line_item_id: null,
    line_date: "2026-01-15",
    project_id: 1,
    sub_cost_code_id: 1,
    description: "original",
    hours: "1",
    rate: "1",
    markup: "0.005",
    price: "1.00",
    is_billable: true,
    is_overhead: false,
    ...overrides,
  };
}

function setupMocks(lineItems: ContractLaborLineItem[] = [sampleLineItem()]) {
  mockGetOne.mockImplementation((path: string) => {
    if (path === CL_PATH) return Promise.resolve(sampleEntry());
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  mockGetList.mockImplementation((path: string) => {
    if (path === LINE_ITEMS_PATH) {
      return Promise.resolve({ data: lineItems, count: lineItems.length });
    }
    return Promise.reject(new Error(`unexpected getList: ${path}`));
  });

  mockPut.mockImplementation((path: string) => {
    if (path === `${CL_PATH}/bill`) {
      return Promise.resolve({});
    }
    return Promise.reject(new Error(`unexpected put: ${path}`));
  });

  mockPost.mockRejectedValue(new Error("unexpected post"));
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function renderReview() {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [`/labor/${PUBLIC_ID}`] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/labor/:public_id",
              element: createElement(LaborReviewScreen),
            }),
          ),
        ),
      ),
    );
  });
}

/** Nullable lookup, safe to poll inside a flushUntil predicate — it must be
 *  able to report "not yet" rather than throw, or the flush degenerates to a
 *  single-shot check that dies instead of waiting (U-152). */
function saveChangesButton(): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Save changes"),
  );
}

async function waitForReviewReady() {
  await flushUntil(() => {
    const desc = container.querySelector(`#desc-${LINE_PUBLIC_ID}`) as HTMLTextAreaElement | null;
    return desc !== null && desc.value === "original";
  });
  const desc = container.querySelector(`#desc-${LINE_PUBLIC_ID}`) as HTMLTextAreaElement;
  expect(desc.value).toBe("original");
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetList.mockReset();
  mockGetOne.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
  mockToast.mockClear();
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

describe("LaborReviewScreen save payload (U-185)", () => {
  it("rounds half-cent line price away from zero on Save changes PUT", async () => {
    renderReview();
    await waitForReviewReady();

    const desc = container.querySelector(`#desc-${LINE_PUBLIC_ID}`) as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(desc, "edited description");
    });

    await flushUntil(() => saveChangesButton()?.disabled === false);
    const btn = saveChangesButton();
    expect(btn, "Save changes button never became enabled after the edit").toBeDefined();
    expect(btn!.disabled).toBe(false);

    mockPut.mockClear();

    await act(async () => {
      btn!.click();
    });

    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === `${CL_PATH}/bill`));
    const call = mockPut.mock.calls.find((c) => c[0] === `${CL_PATH}/bill`);
    expect(call, "Save changes did not PUT the bill endpoint").toBeDefined();

    const body = call![1] as { line_items: { price: number }[] };
    expect(body.line_items[0].price).toBe(1.01);
  });
});
