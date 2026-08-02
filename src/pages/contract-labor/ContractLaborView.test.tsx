import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ContractLaborView from "./ContractLaborView";
import { flushUntil } from "../../__testutils__/flush";
import type { ContractLabor, ContractLaborLineItem } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_ID = "cl-1";
const CL_PATH = `/api/v1/contract-labor/${PUBLIC_ID}`;
const LINE_ITEMS_PATH = `${CL_PATH}/line-items`;

const mockGetList = vi.fn();
const mockGetOne = vi.fn();

let mockEntityItems: Record<string, unknown[]> = {};
let lineItems: ContractLaborLineItem[] = [];

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
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
  useEntityList: (path: string) => ({
    items: mockEntityItems[path] ?? [],
    loading: false,
    error: "",
    reload: vi.fn(),
  }),
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

function sampleLineItem(
  overrides: Partial<ContractLaborLineItem> = {},
): ContractLaborLineItem {
  return {
    id: 10,
    public_id: "cli-1",
    row_version: "li-rv-1",
    created_datetime: null,
    modified_datetime: null,
    contract_labor_id: 1,
    bill_line_item_id: null,
    line_date: "2026-01-15",
    project_id: null,
    sub_cost_code_id: null,
    description: null,
    hours: "1",
    rate: "1",
    markup: null,
    price: null,
    is_billable: true,
    is_overhead: false,
    ...overrides,
  };
}

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

const THREE_LINE_FIXTURE: ContractLaborLineItem[] = [
  sampleLineItem({ id: 1, public_id: "cli-1", hours: "1", rate: "80.02", markup: "0.25" }),
  sampleLineItem({ id: 2, public_id: "cli-2", hours: "0.75", rate: "40.18", markup: null }),
  sampleLineItem({ id: 3, public_id: "cli-3", hours: "0.75", rate: "40.18", markup: null }),
];

function setupMocks() {
  mockGetOne.mockImplementation((path: string) => {
    if (path === CL_PATH) return Promise.resolve(sampleEntry());
    if (path === `${CL_PATH}/daily-summary`) return Promise.resolve({});
    return Promise.reject(new Error(`unexpected getOne: ${path}`));
  });

  mockGetList.mockImplementation((path: string) => {
    if (path === LINE_ITEMS_PATH) {
      return Promise.resolve({ data: lineItems, count: lineItems.length });
    }
    return Promise.reject(new Error(`unexpected getList: ${path}`));
  });
}

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function renderView() {
  act(() => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [`/contract-labor/${PUBLIC_ID}`] },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            Routes,
            null,
            createElement(Route, {
              path: "/contract-labor/:publicId",
              element: createElement(ContractLaborView),
            }),
          ),
        ),
      ),
    );
  });
}

async function waitForLineItemRows() {
  await flushUntil(() => {
    const rows = container.querySelectorAll(".data-table tbody tr");
    return rows.length >= lineItems.length;
  });
  expect(container.querySelectorAll(".data-table tbody tr").length).toBe(lineItems.length);
}

function lineItemCell(rowIndex: number, cellIndex: number): HTMLElement {
  const rows = container.querySelectorAll(".data-table tbody tr");
  const row = rows[rowIndex];
  if (!row) throw new Error(`row ${rowIndex} not found`);
  const cell = row.querySelectorAll("td")[cellIndex];
  if (!cell) throw new Error(`cell ${cellIndex} not found on row ${rowIndex}`);
  return cell as HTMLElement;
}

function footerValue(label: "Total Hours" | "Total Amount" | "Total Price"): string {
  const footer = container.querySelector(".cl-line-items-total");
  if (!footer) throw new Error("line-items footer not rendered");
  for (const span of footer.querySelectorAll("span")) {
    const strong = span.querySelector("strong");
    if (strong?.textContent?.trim() === `${label}:`) {
      return (span.textContent ?? "").replace(`${label}:`, "").trim();
    }
  }
  throw new Error(`footer span not found for: ${label}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetList.mockReset();
  mockGetOne.mockReset();
  mockEntityItems = {};
  lineItems = THREE_LINE_FIXTURE;
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

describe("ContractLaborView line money (U-198)", () => {
  it('row 1 Price cell renders "$100.03" (float renders "$100.02")', async () => {
    renderView();
    await waitForLineItemRows();
    expect(lineItemCell(0, 8).textContent?.trim()).toBe("$100.03");
  });

  it('row 2 Amount cell renders "$30.14" (float renders "$30.13")', async () => {
    renderView();
    await waitForLineItemRows();
    expect(lineItemCell(1, 7).textContent?.trim()).toBe("$30.14");
  });

  it('Total Amount footer renders "$140.30" (float renders "$140.29")', async () => {
    renderView();
    await waitForLineItemRows();
    expect(footerValue("Total Amount")).toBe("$140.30");
  });

  it('Total Price footer renders "$160.31" (float renders "$160.30")', async () => {
    renderView();
    await waitForLineItemRows();
    expect(footerValue("Total Price")).toBe("$160.31");
  });
});

describe("ContractLaborView line money — malformed hours (U-198)", () => {
  const TWO_LINE_FIXTURE: ContractLaborLineItem[] = [
    sampleLineItem({ id: 1, public_id: "cli-bad", hours: "abc", rate: "80", markup: null }),
    sampleLineItem({ id: 2, public_id: "cli-good", hours: "1", rate: "80.02", markup: "0.25" }),
  ];

  // Reassigning `lineItems` is enough: setupMocks' getList closure dereferences
  // the module-level binding when it is CALLED, not when it is installed, so
  // re-stubbing the router here would be a no-op (same rule as the note above
  // `mockEntityItems`, and how ContractLaborEdit.test.tsx swaps its fixtures).
  it("malformed row Price cell renders NaN (not a plausible $0.00 over broken data)", async () => {
    lineItems = TWO_LINE_FIXTURE;
    renderView();
    await waitForLineItemRows();
    expect(lineItemCell(0, 8).textContent?.trim()).toBe("NaN");
  });

  it("Total Price footer renders NaN (broken row must not vanish from the sum)", async () => {
    lineItems = TWO_LINE_FIXTURE;
    renderView();
    await waitForLineItemRows();
    expect(footerValue("Total Price")).toBe("NaN");
  });

  // Pins the guard's SHAPE, not just its presence. `Number.isFinite` and
  // `Number.isNaN` differ only on Infinity, so without this spec the guard can
  // be silently narrowed to isNaN and every other spec stays green — the one
  // mutation that survived the first matrix run.
  it("overflowing row Price cell renders Infinity, not a plausible $0.00", async () => {
    lineItems = [
      sampleLineItem({ id: 1, public_id: "cli-huge", hours: "1e400", rate: "80", markup: "0.25" }),
    ];
    renderView();
    await waitForLineItemRows();
    expect(lineItemCell(0, 8).textContent?.trim()).toBe("Infinity");
  });
});
