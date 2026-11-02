import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ContractLaborEdit from "./ContractLaborEdit";
import { flushUntil } from "../../__testutils__/flush";
import { setInputValue, setSelectValue } from "../../__testutils__/domEvents";
import { deferred } from "../../hooks/__testutils__/renderHook";
import type {
  ContractLabor,
  ContractLaborCodeSuggestions,
  ContractLaborLineItem,
  ContractLaborVendorConfig,
  Project,
  SubCostCode,
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
const mockDel = vi.fn();
const mockToast = vi.fn();
const mockNavigate = vi.fn();

// Per-spec fixtures the ONE mock router below reads. Specs assign these
// instead of re-stubbing the whole router, so a newly-fetched path only has
// to be taught to `setupMocks` once. A populated entry must keep returning
// the SAME array reference across renders — handing back a fresh array per
// call would re-fire the vendorDefaults effect on every render.
let mockEntityItems: Record<string, unknown[]> = {};
let lineItems: ContractLaborLineItem[] = [];
let vendorConfig: ContractLaborVendorConfig = {};
type EffectiveRatePayload = {
  hourly_rate: string | null;
  markup: string | null;
  rate_source: string;
};

/** Per project id: suggestion ids to return, an Error to reject with, or "pending" to never settle. Unset ⇒ empty "none". */
let codeSuggestions: Record<number, number[] | Error | "pending"> = {};

let effectiveRate: EffectiveRatePayload | null = null;
/** When set, effective-rate GETs hang until resolveEffectiveRate(projectId). */
let effectiveRateDeferredRates: Record<number, EffectiveRatePayload> | null = null;
const effectiveRateWaiters = new Map<
  number,
  Array<{ def: ReturnType<typeof deferred<void>>; payload: EffectiveRatePayload }>
>();

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

vi.mock("../../hooks/useEntity", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../hooks/useEntity")>();
  return {
    ...mod,
    useEntityList: (path: string) => ({
      items: mockEntityItems[path] ?? [],
      loading: false,
      error: "",
      reload: vi.fn(),
    }),
    deleteEntity: (...args: unknown[]) => mockDel(...args),
  };
});

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

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

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
    if (path.startsWith(`${CL_PATH}/code-suggestions`)) {
      const q = path.split("?")[1] ?? "";
      const projectId = Number(new URLSearchParams(q).get("project_id"));
      const stub = codeSuggestions[projectId];
      if (stub instanceof Error) return Promise.reject(stub);
      if (stub === "pending") return new Promise<never>(() => {});
      const body: ContractLaborCodeSuggestions = {
        project_id: projectId,
        sub_cost_code_ids: stub ?? [],
        source: stub && stub.length > 0 ? "vendor_project" : "none",
      };
      return Promise.resolve(body);
    }
    if (path.startsWith("/api/v1/contract-labor/effective-rate")) {
      const q = path.split("?")[1] ?? "";
      const projectId = Number(new URLSearchParams(q).get("project_id"));
      if (effectiveRateDeferredRates) {
        const payload = effectiveRateDeferredRates[projectId];
        if (payload === undefined) {
          return Promise.reject(new Error(`effective-rate not stubbed for project ${projectId}`));
        }
        const def = deferred<void>();
        const list = effectiveRateWaiters.get(projectId) ?? [];
        list.push({ def, payload });
        effectiveRateWaiters.set(projectId, list);
        return def.promise.then(() => payload);
      }
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

function firstCard(): ParentNode {
  const card = container.querySelector(".cl-line-item-card");
  if (!card) throw new Error("line-item card not rendered");
  return card;
}

/** Throws on miss — for use in assertions, never as a flushUntil predicate. */
function labeledControl<K extends "input" | "select">(
  label: string,
  tag: K,
): HTMLElementTagNameMap[K] {
  return labeledControlInCard(firstCard(), label, tag);
}

const labeledInput = (label: string) => labeledControl(label, "input");
const labeledSelect = (label: string) => labeledControl(label, "select");

function buttonByText(text: string): HTMLButtonElement | undefined {
  const btn = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
  return btn instanceof HTMLButtonElement ? btn : undefined;
}

function saveChangesButton(): HTMLButtonElement | undefined {
  return buttonByText("Save Changes");
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
  mockDel.mockReset();
  mockToast.mockClear();
  mockNavigate.mockClear();
  mockEntityItems = {};
  lineItems = [];
  vendorConfig = {};
  effectiveRate = null;
  codeSuggestions = {};
  effectiveRateDeferredRates = null;
  effectiveRateWaiters.clear();
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

  it("does not persist price 0 when hours×rate overflows to Infinity (U-202)", async () => {
    // Before U-202 this persisted price 0 — a plausible $0.00 written over broken data.
    renderEdit();
    await waitForLineForm();

    await act(async () => {
      setInputValue(labeledInput("Hours"), "1e200");
      setInputValue(labeledInput("Rate (per hour)"), "1e200");
      setInputValue(labeledInput("Markup (%)"), "25");
    });
    expect(labeledInput("Hours").value).toBe("1e200");
    expect(labeledInput("Rate (per hour)").value).toBe("1e200");
    expect(labeledInput("Markup (%)").value).toBe("25");

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
    // `isFinite === false` already excludes 0; the wire assertion is the one
    // that carries the money claim — a NULL price, not a plausible $0.00.
    expect(Number.isFinite(body.line_items[0].price)).toBe(false);
    expect(JSON.parse(JSON.stringify(body)).line_items[0].price).toBe(null);
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

function deleteButton(): HTMLButtonElement | undefined {
  return buttonByText("Delete") ?? buttonByText("Deleting…");
}

const CL_DELETE_INVALIDATION_KEYS = [
  ["contract-labor-list"],
  ["contract-labor-count"],
  ["contract-labor-billing-periods"],
  ["contract-labor"],
] as const;

function expectPrefixInvalidated(prefix: readonly unknown[]) {
  const queries = queryClient.getQueryCache().findAll({ queryKey: prefix });
  expect(queries.length).toBeGreaterThan(0);
  for (const query of queries) {
    expect(query.state.isInvalidated).toBe(true);
  }
}

describe("ContractLaborEdit delete (U-683a)", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockDel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("confirm → DELETE → cache reconciled → toast → navigate", async () => {
    queryClient.setQueryData(["cl-entry", PUBLIC_ID], sampleEntry());
    queryClient.setQueryData(["cl-line-items", PUBLIC_ID], [sampleLineItem()]);
    queryClient.setQueryData(["cl-daily-summary", PUBLIC_ID], {});
    queryClient.setQueryData(["contract-labor-list", "status=draft"], [{ public_id: PUBLIC_ID }]);
    queryClient.setQueryData(["contract-labor-count", "status=draft"], { count: 1 });
    queryClient.setQueryData(["contract-labor-billing-periods"], ["2026-01"]);
    queryClient.setQueryData(["contract-labor", "by-status", "draft"], [{ public_id: PUBLIC_ID }]);

    renderEdit();
    await waitForLineForm();

    expect(deleteButton()).toBeDefined();
    await act(async () => {
      deleteButton()!.click();
    });

    await flushUntil(() => mockDel.mock.calls.some((c) => c[0] === CL_PATH));
    expect(mockDel).toHaveBeenCalledWith(CL_PATH);
    expect(queryClient.getQueryData(["cl-entry", PUBLIC_ID])).toBeUndefined();
    expect(queryClient.getQueryData(["cl-line-items", PUBLIC_ID])).toBeUndefined();
    expect(queryClient.getQueryData(["cl-daily-summary", PUBLIC_ID])).toBeUndefined();
    for (const key of CL_DELETE_INVALIDATION_KEYS) {
      expectPrefixInvalidated(key);
    }
    expect(mockToast).toHaveBeenCalledWith("Entry deleted.");
    expect(mockNavigate).toHaveBeenCalledWith("/contract-labor/list");
  });

  it("on delete error shows toast and does not navigate", async () => {
    const { ApiError } = await import("../../api/client");
    mockDel.mockRejectedValue(new ApiError(409, "Entry is locked"));

    renderEdit();
    await waitForLineForm();

    await act(async () => {
      deleteButton()!.click();
    });

    await flushUntil(() => mockToast.mock.calls.length > 0);
    expect(mockToast).toHaveBeenCalledWith("Entry is locked", "error");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("hides Delete when entry is billed", async () => {
    mockGetOne.mockImplementation((path: string) => {
      if (path === CL_PATH) return Promise.resolve(sampleEntry({ status: "billed" }));
      if (path === `${CL_PATH}/daily-summary`) return Promise.resolve({});
      if (path === "/api/v1/contract-labor/vendor-config") return Promise.resolve(vendorConfig);
      return Promise.reject(new Error(`unexpected getOne: ${path}`));
    });

    renderEdit();
    await waitForLineForm();

    expect(deleteButton()).toBeUndefined();
  });
});

function lineCards(): HTMLElement[] {
  return Array.from(container.querySelectorAll(".cl-line-item-card"));
}

function lineCardByNumber(n: number): HTMLElement {
  const cards = lineCards();
  const card = cards.find((c) =>
    c.querySelector(".cl-line-item-number")?.textContent?.trim() === `Line ${n}`,
  );
  if (!card) throw new Error(`Line ${n} card not found (have ${cards.length} cards)`);
  return card;
}

function labeledControlInCard<K extends "input" | "select">(
  card: ParentNode,
  label: string,
  tag: K,
): HTMLElementTagNameMap[K] {
  for (const el of card.querySelectorAll("label")) {
    if (el.textContent?.trim() === label) {
      const control = el.parentElement?.querySelector(tag);
      if (!control) throw new Error(`no ${tag} under label: ${label}`);
      return control;
    }
  }
  throw new Error(`${tag} not found for label: ${label}`);
}

function removeButtonInCard(card: ParentNode): HTMLButtonElement {
  const btn = card.querySelector("button.btn-danger");
  if (!btn || !(btn instanceof HTMLButtonElement)) throw new Error("Remove button not found in card");
  return btn;
}

function addLineItemButton(): HTMLButtonElement {
  const btn = buttonByText("+ Add Line Item");
  if (!btn) throw new Error("+ Add Line Item not found");
  return btn;
}

function armDeferredEffectiveRate(ratesByProject: Record<number, EffectiveRatePayload>) {
  effectiveRateDeferredRates = ratesByProject;
  effectiveRate = null;
}

function resolveEffectiveRate(projectId: number) {
  const list = effectiveRateWaiters.get(projectId);
  const next = list?.shift();
  if (!next) throw new Error(`no pending effective-rate for project ${projectId}`);
  next.def.resolve();
}

function rejectEffectiveRate(projectId: number, err: Error = new Error("effective-rate failed")) {
  const list = effectiveRateWaiters.get(projectId);
  const next = list?.shift();
  if (!next) throw new Error(`no pending effective-rate for project ${projectId}`);
  next.def.reject(err);
}

function submitForReviewButton(): HTMLButtonElement | undefined {
  return buttonByText("Submit For Review");
}

function loadingRateHint(): HTMLElement | null {
  return container.querySelector('[role="status"]');
}

async function assertSaveActionsBlockedWhileRateLoading() {
  expect(saveChangesButton()?.disabled).toBe(true);
  expect(submitForReviewButton()?.disabled).toBe(true);
  expect(loadingRateHint()?.textContent?.trim()).toBe("Loading rate…");
}

function pendingEffectiveRateCount(): number {
  let n = 0;
  for (const list of effectiveRateWaiters.values()) n += list.length;
  return n;
}

async function waitForLineCount(n: number) {
  await flushUntil(() => lineCards().length === n);
  expect(lineCards().length).toBe(n);
}

describe("ContractLaborEdit line uid identity (U-683c)", () => {
  beforeEach(() => {
    mockEntityItems["/api/v1/get/vendors"] = [sampleVendor()];
    mockEntityItems["/api/v1/get/projects"] = [
      sampleProject({ id: 7, name: "Proj A" }),
      sampleProject({ id: 8, public_id: "p-8", name: "Proj B" }),
    ];
  });

  it("remove-before-resolve: effective rate patches the row that still matches, not by index", async () => {
    lineItems = [
      sampleLineItem({ id: 10, public_id: "cli-1", rate: "10", markup: null }),
      sampleLineItem({ id: 11, public_id: "cli-2", rate: "20", markup: null }),
    ];
    armDeferredEffectiveRate({
      7: { hourly_rate: "99", markup: "0.07", rate_source: "vendor_project" },
    });

    renderEdit();
    await waitForLineCount(2);

    const line2 = lineCardByNumber(2);
    await act(async () => {
      setSelectValue(labeledControlInCard(line2, "Project", "select"), "7");
    });
    expect(pendingEffectiveRateCount()).toBe(1);

    const line1 = lineCardByNumber(1);
    await act(async () => {
      removeButtonInCard(line1).click();
    });
    await waitForLineCount(1);

    await act(async () => {
      resolveEffectiveRate(7);
    });

    await flushUntil(() => labeledControlInCard(lineCardByNumber(1), "Rate (per hour)", "input").value === "99");
    const sole = lineCardByNumber(1);
    expect(labeledControlInCard(sole, "Rate (per hour)", "input").value).toBe("99");
    expect(labeledControlInCard(sole, "Markup (%)", "input").value).toBe("7");
    expect(labeledControlInCard(sole, "Project", "select").value).toBe("7");
  });

  it("stale effective-rate response is ignored when project changed again before resolve", async () => {
    lineItems = [sampleLineItem({ id: 10, public_id: "cli-1", rate: "10", markup: null })];
    armDeferredEffectiveRate({
      7: { hourly_rate: "77", markup: "0.07", rate_source: "vendor_project" },
      8: { hourly_rate: "88", markup: "0.14", rate_source: "vendor_project" },
    });

    renderEdit();
    await waitForLineCount(1);

    const card = lineCardByNumber(1);
    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "7");
    });
    expect(pendingEffectiveRateCount()).toBe(1);

    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "8");
    });
    expect(pendingEffectiveRateCount()).toBe(2);

    await act(async () => {
      resolveEffectiveRate(8);
    });
    await flushUntil(() => labeledControlInCard(card, "Rate (per hour)", "input").value === "88");

    await act(async () => {
      resolveEffectiveRate(7);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(labeledControlInCard(card, "Project", "select").value).toBe("8");
    expect(labeledControlInCard(card, "Rate (per hour)", "input").value).toBe("88");
    expect(labeledControlInCard(card, "Markup (%)", "input").value).toBe("14");
  });

  it("sibling lines: effective-rate patches only the row that requested it", async () => {
    lineItems = [
      sampleLineItem({
        id: 10,
        public_id: "cli-1",
        project_id: 7,
        rate: "10",
        markup: "0.05",
      }),
      sampleLineItem({ id: 11, public_id: "cli-2", rate: "20", markup: null }),
    ];
    armDeferredEffectiveRate({
      7: { hourly_rate: "99", markup: "0.14", rate_source: "vendor_project" },
    });

    renderEdit();
    await waitForLineCount(2);

    const line1 = lineCardByNumber(1);
    expect(labeledControlInCard(line1, "Rate (per hour)", "input").value).toBe("10");
    expect(labeledControlInCard(line1, "Markup (%)", "input").value).toBe("5");

    const line2 = lineCardByNumber(2);
    await act(async () => {
      setSelectValue(labeledControlInCard(line2, "Project", "select"), "7");
    });
    expect(pendingEffectiveRateCount()).toBe(1);

    await act(async () => {
      resolveEffectiveRate(7);
    });

    await flushUntil(
      () => labeledControlInCard(lineCardByNumber(2), "Rate (per hour)", "input").value === "99",
    );
    expect(labeledControlInCard(line1, "Rate (per hour)", "input").value).toBe("10");
    expect(labeledControlInCard(line1, "Markup (%)", "input").value).toBe("5");
    expect(labeledControlInCard(line2, "Rate (per hour)", "input").value).toBe("99");
    expect(labeledControlInCard(line2, "Markup (%)", "input").value).toBe("14");
  });

  it("saved line keeps card DOM identity across Save Changes (rate resolved before Save, U-687)", async () => {
    const initialRows = [
      sampleLineItem({
        id: 10,
        public_id: "cli-1",
        project_id: null,
        rate: "10",
        markup: "0.05",
      }),
    ];
    lineItems = initialRows;
    const persistedAfterSave = sampleLineItem({
      id: 10,
      public_id: "cli-1",
      row_version: "li-rv-2",
      project_id: 7,
      rate: "55",
      markup: "0.05",
    });
    let lineItemsReads = 0;
    mockGetList.mockImplementation((path: string) => {
      if (path === LINE_ITEMS_PATH) {
        lineItemsReads++;
        const data = lineItemsReads >= 2 ? [persistedAfterSave] : initialRows;
        return Promise.resolve({ data, count: data.length });
      }
      return Promise.reject(new Error(`unexpected getList: ${path}`));
    });

    armDeferredEffectiveRate({
      7: { hourly_rate: "55", markup: null, rate_source: "vendor_project" },
    });

    renderEdit();
    await waitForLineCount(1);

    const card = lineCardByNumber(1);
    const rateInput = labeledControlInCard(card, "Rate (per hour)", "input");

    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "7");
    });
    expect(pendingEffectiveRateCount()).toBe(1);

    await act(async () => {
      resolveEffectiveRate(7);
    });
    await flushUntil(() => rateInput.value === "55");

    mockPut.mockClear();
    await act(async () => {
      saveChangesButton()!.click();
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === `${CL_PATH}/bill`));
    await flushUntil(() => lineItemsReads >= 2);

    const rateAfterSave = labeledControlInCard(lineCardByNumber(1), "Rate (per hour)", "input");
    expect(rateAfterSave).toBe(rateInput);
    expect(rateAfterSave.value).toBe("55");
  });

  // Regression guard — passes on origin/main too (controlled inputs); still worth
  // keeping so a revert to index keys cannot slip in unnoticed.
  it("add/remove keeps React identity so description stays on the same physical line card", async () => {
    lineItems = [sampleLineItem({ id: 10, public_id: "cli-1", description: "first line" })];

    renderEdit();
    await waitForLineCount(1);

    await act(async () => {
      addLineItemButton().click();
    });
    await waitForLineCount(2);

    const line2Before = lineCardByNumber(2);
    await act(async () => {
      setInputValue(labeledControlInCard(line2Before, "Description", "input"), "typed on second line");
    });
    expect(labeledControlInCard(line2Before, "Description", "input").value).toBe("typed on second line");

    await act(async () => {
      removeButtonInCard(lineCardByNumber(1)).click();
    });
    await waitForLineCount(1);

    const sole = lineCardByNumber(1);
    expect(labeledControlInCard(sole, "Description", "input").value).toBe("typed on second line");

    mockPut.mockClear();
    await act(async () => {
      saveChangesButton()!.click();
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === `${CL_PATH}/bill`));
    const body = mockPut.mock.calls.find((c) => c[0] === `${CL_PATH}/bill`)![1] as {
      line_items: { description: string | null }[];
    };
    expect(body.line_items).toHaveLength(1);
    expect(body.line_items[0].description).toBe("typed on second line");
  });

  it("save payload line_items omit client uid", async () => {
    lineItems = [sampleLineItem()];

    renderEdit();
    await waitForLineForm();

    mockPut.mockClear();
    await act(async () => {
      saveChangesButton()!.click();
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === `${CL_PATH}/bill`));

    const body = mockPut.mock.calls.find((c) => c[0] === `${CL_PATH}/bill`)![1] as {
      line_items: Record<string, unknown>[];
    };
    expect(body.line_items[0]).not.toHaveProperty("uid");
    expect(Object.keys(body.line_items[0]).sort()).toEqual(
      [
        "description",
        "hours",
        "id",
        "is_billable",
        "is_overhead",
        "line_date",
        "markup",
        "price",
        "project_id",
        "public_id",
        "rate",
        "row_version",
        "sub_cost_code_id",
      ].sort(),
    );
  });
});

describe("ContractLaborEdit pending effective-rate blocks save (U-687)", () => {
  beforeEach(() => {
    mockEntityItems["/api/v1/get/vendors"] = [sampleVendor()];
    mockEntityItems["/api/v1/get/projects"] = [
      sampleProject({ id: 7, name: "Proj A" }),
      sampleProject({ id: 8, public_id: "p-8", name: "Proj B" }),
    ];
  });

  it("held lookup disables save actions, shows Loading rate…, and Save sends no PUT", async () => {
    lineItems = [sampleLineItem({ id: 10, public_id: "cli-1", rate: "10", markup: null })];
    armDeferredEffectiveRate({
      7: { hourly_rate: "42", markup: "0.07", rate_source: "vendor_project" },
    });

    renderEdit();
    await waitForLineCount(1);

    const card = lineCardByNumber(1);
    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "7");
    });
    expect(pendingEffectiveRateCount()).toBe(1);
    await assertSaveActionsBlockedWhileRateLoading();

    mockPut.mockClear();
    await act(async () => {
      saveChangesButton()!.click();
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(mockPut.mock.calls.some((c) => c[0] === `${CL_PATH}/bill`)).toBe(false);

    // The handler-level guard in save() is defence-in-depth only: React drops clicks on a
    // disabled button, so no jsdom test can reach it.
  });

  it("after lookup resolves, save actions enable and Save PUT includes looked-up rate/markup", async () => {
    lineItems = [sampleLineItem({ id: 10, public_id: "cli-1", rate: "10", markup: null })];
    armDeferredEffectiveRate({
      7: { hourly_rate: "42", markup: "0.07", rate_source: "vendor_project" },
    });

    renderEdit();
    await waitForLineCount(1);

    const card = lineCardByNumber(1);
    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "7");
    });
    await assertSaveActionsBlockedWhileRateLoading();

    await act(async () => {
      resolveEffectiveRate(7);
    });
    await flushUntil(() => labeledControlInCard(card, "Rate (per hour)", "input").value === "42");
    expect(loadingRateHint()).toBeNull();
    expect(saveChangesButton()?.disabled).toBe(false);
    expect(submitForReviewButton()?.disabled).toBe(false);

    mockPut.mockClear();
    await act(async () => {
      saveChangesButton()!.click();
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === `${CL_PATH}/bill`));
    const body = mockPut.mock.calls.find((c) => c[0] === `${CL_PATH}/bill`)![1] as {
      line_items: { rate: number | null; markup: number | null }[];
    };
    expect(body.line_items[0].rate).toBe(42);
    expect(body.line_items[0].markup).toBeCloseTo(0.07);
  });

  it("lookup reject re-enables save actions and Save persists typed/default rate", async () => {
    lineItems = [sampleLineItem({ id: 10, public_id: "cli-1", rate: "10", markup: "0.05" })];
    armDeferredEffectiveRate({
      7: { hourly_rate: "99", markup: "0.5", rate_source: "vendor_project" },
    });

    renderEdit();
    await waitForLineCount(1);

    const card = lineCardByNumber(1);
    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "7");
    });
    await assertSaveActionsBlockedWhileRateLoading();

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      rejectEffectiveRate(7);
    });
    await flushUntil(() => saveChangesButton()?.disabled === false);
    errSpy.mockRestore();
    expect(loadingRateHint()).toBeNull();

    mockPut.mockClear();
    await act(async () => {
      saveChangesButton()!.click();
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === `${CL_PATH}/bill`));
    const body = mockPut.mock.calls.find((c) => c[0] === `${CL_PATH}/bill`)![1] as {
      line_items: { rate: number | null; markup: number | null }[];
    };
    expect(body.line_items[0].rate).toBe(10);
    expect(body.line_items[0].markup).toBeCloseTo(0.05);
  });

  it("two lookups on one line stay blocked until the latest project lookup settles", async () => {
    lineItems = [sampleLineItem({ id: 10, public_id: "cli-1", rate: "10", markup: null })];
    armDeferredEffectiveRate({
      7: { hourly_rate: "77", markup: "0.07", rate_source: "vendor_project" },
      8: { hourly_rate: "88", markup: "0.14", rate_source: "vendor_project" },
    });

    renderEdit();
    await waitForLineCount(1);

    const card = lineCardByNumber(1);
    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "7");
    });
    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "8");
    });
    expect(pendingEffectiveRateCount()).toBe(2);

    await act(async () => {
      resolveEffectiveRate(7);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    await assertSaveActionsBlockedWhileRateLoading();

    await act(async () => {
      resolveEffectiveRate(8);
    });
    await flushUntil(() => saveChangesButton()?.disabled === false);
    expect(loadingRateHint()).toBeNull();
  });

  it("an older lookup settling after a newer one started cannot unblock save (generation never resets)", async () => {
    lineItems = [sampleLineItem({ id: 10, public_id: "cli-1", rate: "10", markup: null })];
    mockEntityItems["/api/v1/get/projects"] = [
      sampleProject({ id: 7, name: "Proj A" }),
      sampleProject({ id: 8, public_id: "p-8", name: "Proj B" }),
      sampleProject({ id: 9, public_id: "p-9", name: "Proj C" }),
    ];
    armDeferredEffectiveRate({
      7: { hourly_rate: "77", markup: "0.07", rate_source: "vendor_project" },
      8: { hourly_rate: "88", markup: "0.08", rate_source: "vendor_project" },
      9: { hourly_rate: "99", markup: "0.09", rate_source: "vendor_project" },
    });

    renderEdit();
    await waitForLineCount(1);
    const card = lineCardByNumber(1);
    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "7");
    });
    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "8");
    });
    await act(async () => {
      resolveEffectiveRate(8);
    });
    await flushUntil(() => saveChangesButton()?.disabled === false);
    expect(saveChangesButton()!.disabled).toBe(false);

    await act(async () => {
      setSelectValue(labeledControlInCard(card, "Project", "select"), "9");
    });
    await assertSaveActionsBlockedWhileRateLoading();

    // The stale lookup for project 7 settles while 9 is still loading.
    await act(async () => {
      resolveEffectiveRate(7);
    });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    await assertSaveActionsBlockedWhileRateLoading();

    await act(async () => {
      resolveEffectiveRate(9);
    });
    await flushUntil(() => saveChangesButton()?.disabled === false);
    expect(loadingRateHint()).toBeNull();
    expect((labeledControlInCard(lineCardByNumber(1), "Rate (per hour)", "input") as HTMLInputElement).value).toBe("99");
  });

  it("removing the line while its lookup is pending re-enables save actions", async () => {
    lineItems = [
      sampleLineItem({ id: 10, public_id: "cli-1", rate: "10", markup: null }),
      sampleLineItem({ id: 11, public_id: "cli-2", rate: "20", markup: null }),
    ];
    armDeferredEffectiveRate({
      7: { hourly_rate: "99", markup: "0.07", rate_source: "vendor_project" },
    });

    renderEdit();
    await waitForLineCount(2);

    const line2 = lineCardByNumber(2);
    await act(async () => {
      setSelectValue(labeledControlInCard(line2, "Project", "select"), "7");
    });
    await assertSaveActionsBlockedWhileRateLoading();

    await act(async () => {
      removeButtonInCard(line2).click();
    });
    await waitForLineCount(1);
    await flushUntil(() => saveChangesButton()?.disabled === false);
    expect(loadingRateHint()).toBeNull();
  });
});

function sampleSubCostCode(id: number, number: string, overrides: Partial<SubCostCode> = {}): SubCostCode {
  return {
    id,
    public_id: `scc-${id}`,
    row_version: `scc-rv-${id}`,
    created_datetime: null,
    modified_datetime: null,
    number,
    name: `Name ${number}`,
    description: `Desc ${number}`,
    cost_code_id: 1,
    aliases: null,
    ...overrides,
  };
}

function suggestionCalls(): string[] {
  return mockGetOne.mock.calls
    .map((c) => c[0] as string)
    .filter((p) => p.startsWith(`${CL_PATH}/code-suggestions`));
}

function subCostCodeSelect(card: ParentNode = firstCard()): HTMLSelectElement {
  return labeledControlInCard(card, "SubCostCode", "select");
}

/** Shape of a select: top-level children as either an option value or `group:<label>[values]`. */
function selectShape(select: HTMLSelectElement): string[] {
  return Array.from(select.children).map((el) => {
    if (el instanceof HTMLOptGroupElement) {
      const vals = Array.from(el.querySelectorAll("option")).map((o) => o.value);
      return `group:${el.label}[${vals.join(",")}]`;
    }
    return (el as HTMLOptionElement).value;
  });
}

const PLAIN_SHAPE = ["", "1", "2", "3"];

/**
 * Settle the suggestion queries, which only mount once the line form renders.
 * Empirically, zero-ms timer advances (flushUntil's loop, or this loop at 0)
 * never delivered the suggestion query's resolve to the select; small real
 * advances in separate act() scopes do. Every spec still hard-asserts the
 * rendered shape afterwards, so an exhausted settle fails loudly.
 */
async function settleSuggestions() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
  }
}

describe("ContractLaborEdit SubCostCode suggestions (U-749)", () => {
  beforeEach(() => {
    // Deliberately registered out of number order — the plain list sorts by number.
    mockEntityItems["/api/v1/get/sub-cost-codes"] = [
      sampleSubCostCode(3, "01-300"),
      sampleSubCostCode(1, "01-100"),
      sampleSubCostCode(2, "01-200", { description: null }),
    ];
    mockEntityItems["/api/v1/get/projects"] = [sampleProject(), sampleProject({ id: 8, public_id: "p-8", name: "Proj B" })];
  });

  it("renders a Suggested optgroup in API order above All codes, dropping unknown ids", async () => {
    lineItems = [sampleLineItem({ project_id: 7 })];
    codeSuggestions = { 7: [3, 99, 1] };

    renderEdit();
    await waitForLineForm();
    await settleSuggestions();

    expect(selectShape(subCostCodeSelect())).toEqual([
      "",
      "group:Suggested[3,1]",
      "group:All codes[1,2,3]",
    ]);
    const suggested = subCostCodeSelect().querySelector('optgroup[label="Suggested"]')!;
    expect(Array.from(suggested.querySelectorAll("option")).map((o) => o.textContent)).toEqual([
      "01-300 - Desc 01-300",
      "01-100 - Desc 01-100",
    ]);
    // Label format falls back to name when description is empty.
    const all = subCostCodeSelect().querySelector('optgroup[label="All codes"]')!;
    expect(all.querySelectorAll("option")[1].textContent).toBe("01-200 - Name 01-200");
    expect(subCostCodeSelect().options[0].textContent).toBe("— Select SubCostCode —");
  });

  it("renders the plain list unchanged when the response is empty", async () => {
    lineItems = [sampleLineItem({ project_id: 7 })];
    codeSuggestions = { 7: [] };

    renderEdit();
    await waitForLineForm();
    await settleSuggestions();
    expect(suggestionCalls()).toHaveLength(1);
    expect(queryClient.getQueryState(["cl-code-suggestions", PUBLIC_ID, "7"])?.status).toBe("success");

    expect(selectShape(subCostCodeSelect())).toEqual(PLAIN_SHAPE);
  });

  it("renders the plain list unchanged (and no error) when the request fails", async () => {
    lineItems = [sampleLineItem({ project_id: 7 })];
    codeSuggestions = { 7: new Error("boom") };

    renderEdit();
    await waitForLineForm();
    await settleSuggestions();
    expect(queryClient.getQueryState(["cl-code-suggestions", PUBLIC_ID, "7"])?.status).toBe("error");

    expect(selectShape(subCostCodeSelect())).toEqual(PLAIN_SHAPE);
    expect(container.textContent).not.toContain("boom");
  });

  it("selecting a suggested option saves the same sub_cost_code_id with an unchanged payload shape", async () => {
    lineItems = [sampleLineItem({ project_id: 7 })];
    codeSuggestions = { 7: [3] };

    renderEdit();
    await waitForLineForm();
    await settleSuggestions();
    expect(subCostCodeSelect().querySelector("optgroup")).not.toBeNull();
    // No prefill: the suggestion is offered, not chosen.
    expect(subCostCodeSelect().value).toBe("");

    await act(async () => {
      setSelectValue(subCostCodeSelect(), "3");
    });
    expect(subCostCodeSelect().value).toBe("3");
    // The selected node is the Suggested copy — the pick went through that group.
    expect(subCostCodeSelect().selectedOptions[0].parentElement).toBeInstanceOf(HTMLOptGroupElement);
    expect((subCostCodeSelect().selectedOptions[0].parentElement as HTMLOptGroupElement).label).toBe("Suggested");

    mockPut.mockClear();
    await act(async () => {
      saveChangesButton()!.click();
    });
    await flushUntil(() => mockPut.mock.calls.some((c) => c[0] === `${CL_PATH}/bill`));
    const call = mockPut.mock.calls.find((c) => c[0] === `${CL_PATH}/bill`);
    expect(call, "Save Changes did not PUT the bill endpoint").toBeDefined();
    const body = call![1] as { line_items: Record<string, unknown>[] };
    expect(body.line_items[0].sub_cost_code_id).toBe(3);
    expect(body.line_items[0].project_id).toBe(7);
    expect(Object.keys(body.line_items[0]).sort()).toEqual(
      [
        "description",
        "hours",
        "id",
        "is_billable",
        "is_overhead",
        "line_date",
        "markup",
        "price",
        "project_id",
        "public_id",
        "rate",
        "row_version",
        "sub_cost_code_id",
      ].sort(),
    );
  });

  it("makes no request when the project is blank", async () => {
    lineItems = [sampleLineItem({ project_id: null })];

    renderEdit();
    await waitForLineForm();
    // Let any would-be query fire before asserting its absence.
    await settleSuggestions();

    expect(suggestionCalls()).toEqual([]);
    expect(selectShape(subCostCodeSelect())).toEqual(PLAIN_SHAPE);
  });

  it("makes one request per distinct project and groups each line by its own project", async () => {
    lineItems = [
      sampleLineItem({ id: 10, public_id: "cli-1", project_id: 7 }),
      sampleLineItem({ id: 11, public_id: "cli-2", project_id: 7 }),
      sampleLineItem({ id: 12, public_id: "cli-3", project_id: 8 }),
      sampleLineItem({ id: 13, public_id: "cli-4", project_id: null }),
    ];
    codeSuggestions = { 7: [2] };

    renderEdit();
    await waitForLineCount(4);
    await settleSuggestions();

    expect(suggestionCalls().sort()).toEqual([
      `${CL_PATH}/code-suggestions?project_id=7`,
      `${CL_PATH}/code-suggestions?project_id=8`,
    ]);
    expect(selectShape(subCostCodeSelect(lineCardByNumber(1)))).toEqual([
      "",
      "group:Suggested[2]",
      "group:All codes[1,2,3]",
    ]);
    expect(selectShape(subCostCodeSelect(lineCardByNumber(2)))).toEqual([
      "",
      "group:Suggested[2]",
      "group:All codes[1,2,3]",
    ]);
    expect(selectShape(subCostCodeSelect(lineCardByNumber(3)))).toEqual(PLAIN_SHAPE);
    expect(selectShape(subCostCodeSelect(lineCardByNumber(4)))).toEqual(PLAIN_SHAPE);
  });

  it("renders the plain list while the request is pending", async () => {
    lineItems = [sampleLineItem({ project_id: 7 })];
    codeSuggestions = { 7: "pending" };

    renderEdit();
    await waitForLineForm();
    await settleSuggestions();

    // The request is really in flight — not merely never sent.
    expect(suggestionCalls()).toEqual([`${CL_PATH}/code-suggestions?project_id=7`]);
    expect(queryClient.getQueryState(["cl-code-suggestions", PUBLIC_ID, "7"])?.fetchStatus).toBe("fetching");
    expect(selectShape(subCostCodeSelect())).toEqual(PLAIN_SHAPE);
  });

  it("changing a line's project swaps the Suggested group to the new project's codes", async () => {
    lineItems = [sampleLineItem({ project_id: 7 })];
    codeSuggestions = { 7: [3], 8: [2, 1] };
    effectiveRate = { hourly_rate: null, markup: null, rate_source: "none" };

    renderEdit();
    await waitForLineForm();
    await settleSuggestions();
    expect(selectShape(subCostCodeSelect())).toEqual(["", "group:Suggested[3]", "group:All codes[1,2,3]"]);

    await act(async () => {
      setSelectValue(labeledSelect("Project"), "8");
    });
    await settleSuggestions();

    expect(labeledSelect("Project").value).toBe("8");
    expect(suggestionCalls()).toContain(`${CL_PATH}/code-suggestions?project_id=8`);
    expect(selectShape(subCostCodeSelect())).toEqual(["", "group:Suggested[2,1]", "group:All codes[1,2,3]"]);
  });

  it("keeps the stored value selected when refreshed suggestions drop the selected Suggested option", async () => {
    lineItems = [sampleLineItem({ project_id: 7 })];
    codeSuggestions = { 7: [3] };

    renderEdit();
    await waitForLineForm();
    await settleSuggestions();

    await act(async () => {
      setSelectValue(subCostCodeSelect(), "3");
    });
    expect(subCostCodeSelect().value).toBe("3");
    expect((subCostCodeSelect().selectedOptions[0].parentElement as HTMLOptGroupElement).label).toBe("Suggested");

    // A background refetch returns a different set that no longer has 3.
    const refreshed: ContractLaborCodeSuggestions = { project_id: 7, sub_cost_code_ids: [1], source: "vendor" };
    await act(async () => {
      queryClient.setQueryData(["cl-code-suggestions", PUBLIC_ID, "7"], refreshed);
    });
    await settleSuggestions();

    // The option list updated…
    expect(selectShape(subCostCodeSelect())).toEqual(["", "group:Suggested[1]", "group:All codes[1,2,3]"]);
    // …and the <select> stayed controlled on the stored value, now via the All codes copy.
    expect(subCostCodeSelect().value).toBe("3");
    const selected = subCostCodeSelect().selectedOptions[0];
    expect(selected.value).toBe("3");
    expect((selected.parentElement as HTMLOptGroupElement).label).toBe("All codes");
  });
});
