import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ContractLaborEdit from "./ContractLaborEdit";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue, setSelectValue } from "../../__testutils__/domEvents";
import type {
  ContractLabor,
  ContractLaborLineItem,
  ContractLaborVendorConfig,
  Project,
  Vendor,
} from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PUBLIC_ID = "cl-1";
const CL_PATH = `/api/v1/contract-labor/${PUBLIC_ID}`;
const LINE_ITEMS_PATH = `${CL_PATH}/line-items`;

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();

// Per-spec fixtures the ONE mock router below reads. Specs assign these
// instead of re-stubbing the whole router, so a newly-fetched path only has
// to be taught to `setupMocks` once. A populated entry must keep returning
// the SAME array reference across renders — handing back a fresh array per
// call would re-fire the vendorDefaults effect on every render.
let mockEntityItems: Record<string, unknown[]> = {};
let lineItems: ContractLaborLineItem[] = [];
let vendorConfig: ContractLaborVendorConfig = {};
let effectiveRate: { hourly_rate: string | null; markup: string | null; rate_source: string } | null =
  null;

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

vi.mock("../../components/ReviewTimeline", () => ({
  default: () => null,
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

function sampleVendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: 1,
    public_id: "v-1",
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    name: "Acme Labor",
    abbreviation: null,
    taxpayer_id: null,
    vendor_type_id: null,
    is_draft: false,
    is_deleted: false,
    is_contract_labor: true,
    notes: null,
    hourly_rate: null,
    markup: null,
    ...overrides,
  };
}

function sampleProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 7,
    public_id: "p-7",
    row_version: "rv-7",
    created_datetime: null,
    modified_datetime: null,
    name: "Proj A",
    description: null,
    status: null,
    customer_id: null,
    abbreviation: null,
    notes: null,
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

function setupMocks() {
  mockGetOne.mockImplementation((path: string) => {
    if (path === CL_PATH) return Promise.resolve(sampleEntry());
    // Summary values feed only the hours tiles / allocation banner, which no
    // assertion here reads; the page's `?? 0` fallbacks cover the empty shape.
    if (path === `${CL_PATH}/daily-summary`) return Promise.resolve({});
    if (path === "/api/v1/contract-labor/vendor-config") return Promise.resolve(vendorConfig);
    if (path.startsWith("/api/v1/contract-labor/effective-rate")) {
      return effectiveRate
        ? Promise.resolve(effectiveRate)
        : Promise.reject(new Error(`effective-rate not stubbed: ${path}`));
    }
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
function labeledControl<K extends "input" | "select">(
  label: string,
  tag: K,
): HTMLElementTagNameMap[K] {
  const card = container.querySelector(".cl-line-item-card");
  if (!card) throw new Error("line-item card not rendered");
  for (const el of card.querySelectorAll("label")) {
    if (el.textContent?.trim() === label) {
      const control = el.parentElement?.querySelector(tag);
      if (!control) throw new Error(`no ${tag} under label: ${label}`);
      return control;
    }
  }
  throw new Error(`${tag} not found for label: ${label}`);
}

const labeledInput = (label: string) => labeledControl(label, "input");
const labeledSelect = (label: string) => labeledControl(label, "select");

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

/** Same rule as waitForLineForm: report "not yet" instead of throwing, so the
 *  flush actually waits and the caller's hard assertion stays failable. */
async function waitForMarkupFilled() {
  await flushUntil(() => {
    try {
      return labeledInput("Markup (%)").value !== "";
    } catch {
      return false;
    }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockGetList.mockReset();
  mockGetOne.mockReset();
  mockPost.mockReset();
  mockPut.mockReset();
  mockEntityItems = {};
  lineItems = [];
  vendorConfig = {};
  effectiveRate = null;
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

  it("persists exact decimal price 100.03 on float-lossy hours×rate×markup (U-192)", async () => {
    renderEdit();
    await waitForLineForm();

    await act(async () => {
      setInputValue(labeledInput("Hours"), "1");
      setInputValue(labeledInput("Rate (per hour)"), "80.02");
      setInputValue(labeledInput("Markup (%)"), "25");
    });
    expect(labeledInput("Hours").value).toBe("1");
    expect(labeledInput("Rate (per hour)").value).toBe("80.02");
    expect(labeledInput("Markup (%)").value).toBe("25");

    const floatProduct = Number("1") * Number("80.02") * (1 + 25 / 100);
    expect(floatProduct).toBe(100.02499999999999);

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
    expect(body.line_items[0].price).toBe(100.03);
  });
});

describe("ContractLaborEdit markup display (U-195)", () => {
  it('shows "7" for markup fraction "0.07", not float garbage', async () => {
    lineItems = [sampleLineItem({ markup: "0.07" })];

    renderEdit();
    await waitForLineForm();

    // The spelling this replaced: String(Number("0.07") * 100) === "7.000000000000001".
    // Reverting fromServer to it makes this spec go RED.
    expect(labeledInput("Markup (%)").value).toBe("7");
  });

  it("shows empty Markup (%) when server markup is null (save path persists NULL, not 0)", async () => {
    lineItems = [sampleLineItem({ markup: null })];

    renderEdit();
    await waitForLineForm();

    expect(labeledInput("Markup (%)").value).toBe("");
  });

  it("fills Markup (%) from vendor-config defaults on an empty line (fractionToPercent ~223)", async () => {
    mockEntityItems["/api/v1/get/vendors"] = [sampleVendor()];
    vendorConfig = {
      "Acme Labor": { address: null, city_state_zip: null, rate: "50", markup: "0.14" },
    };

    renderEdit();
    await waitForLineForm();
    await waitForMarkupFilled();

    // Reverting the call site to String(Number(cfg.markup) * 100) renders
    // '14.000000000000002' and this spec goes RED.
    expect(labeledInput("Markup (%)").value).toBe("14");
  });

  it("fills Markup (%) from effective-rate when Project is selected (fractionToPercent ~312)", async () => {
    mockEntityItems["/api/v1/get/vendors"] = [sampleVendor()];
    mockEntityItems["/api/v1/get/projects"] = [sampleProject()];
    // vendorConfig stays empty so the value can only come from effective-rate.
    effectiveRate = { hourly_rate: null, markup: "0.07", rate_source: "vendor_project" };

    renderEdit();
    await waitForLineForm();

    await act(async () => {
      setSelectValue(labeledSelect("Project"), "7");
    });
    await waitForMarkupFilled();

    // Reverting the call site to String(Number(r.markup) * 100) renders
    // '7.000000000000001' and this spec goes RED.
    expect(labeledInput("Markup (%)").value).toBe("7");
  });
});
