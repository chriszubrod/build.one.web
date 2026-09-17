import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Expense, ExpenseLineItem } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetList = vi.fn();
const mockGetOne = vi.fn();

const viewState: {
  item: Expense | null;
  loading: boolean;
  error: string;
} = {
  item: null,
  loading: false,
  error: "",
};

vi.mock("../../hooks/useEntity", () => ({
  useEntityItem: () => ({
    item: viewState.item,
    loading: viewState.loading,
    error: viewState.error,
    reload: vi.fn(),
  }),
}));

vi.mock("../../hooks/useIdNameMap", () => ({
  useIdNameMap: (path: string) => {
    if (path.includes("vendors")) return new Map([[10, "Acme Supply"]]);
    if (path.includes("sub-cost")) return new Map([[5, "01 — Materials"]]);
    if (path.includes("projects")) return new Map([[7, "HQ Reno"]]);
    return new Map();
  },
}));

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
  getOne: (...args: unknown[]) => mockGetOne(...args),
}));

vi.mock("../../hooks/useViewAttachmentObjectUrl", () => ({
  useViewAttachmentObjectUrl: (id: string | null) => ({
    objectUrl: id ? `blob:${id}` : null,
    loading: false,
    loadError: false,
  }),
}));

vi.mock("../../components/ReviewTimeline", () => ({
  default: () => null,
}));

function sampleExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1,
    public_id: "exp-1",
    row_version: "rv-1",
    created_datetime: null,
    modified_datetime: null,
    vendor_id: 10,
    expense_date: "2026-09-01 00:00:00",
    reference_number: "EXP-100",
    total_amount: "100.00",
    memo: null,
    is_draft: false,
    is_credit: false,
    status: "completed",
    ...overrides,
  };
}

function sampleLineItem(overrides: Partial<ExpenseLineItem> = {}): ExpenseLineItem {
  return {
    id: 11,
    public_id: "li-1",
    row_version: "rv-li",
    created_datetime: null,
    modified_datetime: null,
    expense_id: 1,
    sub_cost_code_id: 5,
    project_id: 7,
    description: "Lumber",
    quantity: 1,
    rate: "100.00",
    amount: "100.00",
    is_billable: true,
    is_billed: false,
    markup: null,
    price: "100.00",
    is_draft: false,
    ...overrides,
  };
}

let lastContainer: HTMLDivElement;
let lastRoot: Root | null = null;

async function flushEffects(times = 12) {
  await act(async () => {
    for (let i = 0; i < times; i++) await Promise.resolve();
  });
}

async function mountView(): Promise<Root> {
  const { default: ExpenseView } = await import("./ExpenseView");
  const container = document.createElement("div");
  lastContainer = container;
  document.body.appendChild(container);
  const root = createRoot(container);
  lastRoot = root;
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/expense/exp-1"] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: "/expense/:publicId",
            element: createElement(ExpenseView),
          }),
        ),
      ),
    );
  });
  await flushEffects();
  return root;
}

describe("ExpenseView (U-470)", () => {
  beforeEach(() => {
    viewState.item = sampleExpense();
    viewState.loading = false;
    viewState.error = "";
    mockGetList.mockReset();
    mockGetOne.mockReset();
    mockGetList.mockResolvedValue({ data: [] });
    mockGetOne.mockResolvedValue({});
  });

  afterEach(async () => {
    if (lastRoot) {
      await act(async () => { lastRoot!.unmount(); });
      lastRoot = null;
    }
    lastContainer?.remove();
  });

  it("renders the attachment section when a receipt is present", async () => {
    mockGetList.mockResolvedValue({ data: [sampleLineItem()] });
    mockGetOne.mockImplementation((path: string) => {
      if (String(path).includes("expense-line-item-attachment/by-expense-line-item/li-1")) {
        return Promise.resolve({ attachment_id: 99 });
      }
      if (String(path) === "/api/v1/get/attachment/id/99") {
        return Promise.resolve({ public_id: "att-99" });
      }
      return Promise.resolve({});
    });
    await mountView();
    const viewer = lastContainer.querySelector(".pdf-viewer");
    expect(viewer).not.toBeNull();
    expect(viewer?.querySelector(".line-items-heading")?.textContent).toBe("Attachment");
    const iframe = viewer?.querySelector("iframe") as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    expect(iframe.title).toBe("Expense receipt");
    expect(iframe.src).toContain("blob:att-99");
  });

  it("does not render a duplicated Completed badge", async () => {
    viewState.item = sampleExpense({
      status: "completed",
      is_draft: false,
      review_status: "Completed",
      review_status_kind: "approved",
    });
    await mountView();
    const badges = Array.from(lastContainer.querySelectorAll(".status-badge"))
      .map((b) => b.textContent);
    expect(badges.filter((t) => t === "Completed")).toHaveLength(1);
  });

  it("resolves SubCostCode and Project names instead of raw ids", async () => {
    mockGetList.mockResolvedValue({ data: [sampleLineItem()] });
    await mountView();
    const text = lastContainer.textContent ?? "";
    expect(text).toContain("01 — Materials");
    expect(text).toContain("HQ Reno");
  });

  it("formats the expense date rather than showing the raw ISO string", async () => {
    await mountView();
    const dateRow = Array.from(lastContainer.querySelectorAll(".detail-row"))
      .find((row) => row.querySelector("dt")?.textContent === "Expense Date");
    const shown = dateRow?.querySelector("dd")?.textContent ?? "";
    // Assert the LITERAL output. The previous pair -- not the raw ISO, not
    // empty -- was satisfied by any non-empty differing string, "Invalid Date"
    // included. U-470 review, F7.
    expect(shown).toBe("09/01/2026");
  });
});
