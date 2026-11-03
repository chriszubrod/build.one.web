import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Expense, ExpenseLineItem } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetList = vi.fn();
const mockGetOne = vi.fn();
const mockNavigate = vi.fn();
const mockToast = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return { ...mod, useNavigate: () => mockNavigate, __realUseNavigate: mod.useNavigate };
});

vi.mock("../../components/Toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => mockToast(...args) }),
}));

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

const mockReviewTimeline = vi.fn((_props: unknown) => null);
vi.mock("../../components/ReviewTimeline", () => ({
  default: (props: unknown) => mockReviewTimeline(props),
}));

type TimelineProps = {
  readOnly?: boolean;
  onAfterAction?: (action: "submit" | "advance" | "decline") => void | Promise<void>;
};

function lastTimelineProps(): TimelineProps {
  const calls = mockReviewTimeline.mock.calls as unknown as [TimelineProps][];
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]![0];
}

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

async function mountView(
  entry: string | { pathname: string; state?: unknown } = "/expense/exp-1",
): Promise<Root> {
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
        { initialEntries: [entry] },
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
    mockNavigate.mockReset();
    mockToast.mockReset();
    mockReviewTimeline.mockClear();
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

describe("ExpenseView — submit from the View, keep the tab, move to the next draft (2026-10-03)", () => {
  beforeEach(() => {
    viewState.item = sampleExpense({ status: "draft", is_draft: true });
    viewState.loading = false;
    viewState.error = "";
    mockGetList.mockReset();
    mockGetOne.mockReset();
    mockNavigate.mockReset();
    mockToast.mockReset();
    mockReviewTimeline.mockClear();
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

  it("offers review actions on a draft (the timeline is NOT read-only) with no pre-save hook", async () => {
    await mountView();
    const props = lastTimelineProps();
    expect(props.readOnly).toBe(false);
    expect(typeof props.onAfterAction).toBe("function");
    expect((props as { onBeforeAction?: unknown }).onBeforeAction).toBeUndefined();
  });

  it("keeps the timeline read-only on a completed expense (terminal server-side)", async () => {
    viewState.item = sampleExpense({ status: "completed", is_draft: false });
    await mountView();
    expect(lastTimelineProps().readOnly).toBe(true);
  });

  it("breadcrumb returns to the tab the expense lives on, not the Completed default", async () => {
    await mountView();
    const crumb = Array.from(lastContainer.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "Expenses",
    ) as HTMLAnchorElement | undefined;
    expect(crumb).toBeDefined();
    expect(crumb!.getAttribute("href")).toBe("/expense/list?status=draft");
  });

  describe("U-753 return to where the user was", () => {
    const ORIGIN = "/expense/list?status=completed&from=2026-01-01&to=2026-03-31";
    const FROM_COMPLETED = { pathname: "/expense/exp-1", state: { returnTo: ORIGIN } };

    function crumbHref(): string | null {
      const crumb = Array.from(lastContainer.querySelectorAll("a")).find(
        (a) => a.textContent?.trim() === "Expenses",
      );
      expect(crumb).toBeDefined();
      return crumb!.getAttribute("href");
    }

    it("the Expenses breadcrumb points at the origin list", async () => {
      await mountView(FROM_COMPLETED);
      expect(crumbHref()).toBe(ORIGIN);
    });

    it("Edit carries the origin along to the edit page", async () => {
      await mountView(FROM_COMPLETED);
      const edit = Array.from(lastContainer.querySelectorAll("button")).find(
        (b) => b.textContent?.trim() === "Edit",
      );
      expect(edit).toBeDefined();
      await act(async () => { edit!.click(); });
      expect(mockNavigate).toHaveBeenCalledWith("/expense/exp-1/edit", { state: { returnTo: ORIGIN } });
    });

    it("a completed expense opened without an origin → the breadcrumb goes to the Draft tab", async () => {
      viewState.item = sampleExpense({ status: "completed", is_draft: false });
      await mountView();
      expect(viewState.item.status).toBe("completed");
      expect(crumbHref()).toBe("/expense/list?status=draft");
    });

    it.each(["https://evil.example/expense/list", "//evil.example", "/admin", "/bill/list?status=draft"])(
      "an unsafe returnTo (%s) is ignored",
      async (returnTo) => {
        await mountView({ pathname: "/expense/exp-1", state: { returnTo } });
        expect(crumbHref()).toBe("/expense/list?status=draft");
      },
    );

    it("the next draft after a submit keeps the origin in returnTo", async () => {
      mockGetList.mockImplementation((path: string) =>
        String(path).startsWith("/api/v1/get/expenses?status=draft")
          ? Promise.resolve({ data: [sampleExpense({ public_id: "exp-next", status: "draft" })], count: 2 })
          : Promise.resolve({ data: [] }));
      await mountView(FROM_COMPLETED);
      await act(async () => { await lastTimelineProps().onAfterAction!("submit"); });
      expect(mockNavigate).toHaveBeenCalledWith("/expense/exp-next", { state: { returnTo: ORIGIN } });
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    it("no more drafts → back to the origin list", async () => {
      mockGetList.mockImplementation((path: string) =>
        String(path).startsWith("/api/v1/get/expenses?status=draft")
          ? Promise.resolve({ data: [sampleExpense({ public_id: "exp-1", status: "draft" })], count: 1 })
          : Promise.resolve({ data: [] }));
      await mountView(FROM_COMPLETED);
      await act(async () => { await lastTimelineProps().onAfterAction!("submit"); });
      expect(mockNavigate).toHaveBeenCalledWith(ORIGIN);
      expect(String(mockToast.mock.calls[0]?.[0])).toContain("no more drafts");
    });
  });

  it("after a submit, opens the next draft when one exists", async () => {
    mockGetList.mockImplementation((path: string) => {
      if (String(path).startsWith("/api/v1/get/expenses?status=draft")) {
        return Promise.resolve({ data: [sampleExpense({ public_id: "exp-next", status: "draft" })], count: 3 });
      }
      return Promise.resolve({ data: [] });
    });
    await mountView();
    await act(async () => { await lastTimelineProps().onAfterAction!("submit"); });
    expect(mockGetList).toHaveBeenCalledWith("/api/v1/get/expenses?status=draft&page=1&page_size=2");
    expect(mockNavigate).toHaveBeenCalledWith("/expense/exp-next", { state: { returnTo: "/expense/list?status=draft" } });
    expect(String(mockToast.mock.calls[0]?.[0])).toContain("next draft");
  });

  it("never opens the expense just submitted as its own next draft (U-621 re-review P2 — SW NetworkFirst can serve the pre-submit list)", async () => {
    mockGetList.mockImplementation((path: string) => {
      if (String(path).startsWith("/api/v1/get/expenses?status=draft")) {
        return Promise.resolve({ data: [
          sampleExpense({ public_id: "exp-1", status: "draft" }),
          sampleExpense({ public_id: "exp-next", status: "draft" }),
        ], count: 2 });
      }
      return Promise.resolve({ data: [] });
    });
    await mountView();
    await act(async () => { await lastTimelineProps().onAfterAction!("submit"); });
    expect(mockNavigate).toHaveBeenCalledWith("/expense/exp-next", { state: { returnTo: "/expense/list?status=draft" } });

    mockNavigate.mockReset();
    mockGetList.mockImplementation((path: string) =>
      String(path).startsWith("/api/v1/get/expenses?status=draft")
        ? Promise.resolve({ data: [sampleExpense({ public_id: "exp-1", status: "draft" })], count: 1 })
        : Promise.resolve({ data: [] }));
    await lastRoot!.unmount(); lastRoot = null; lastContainer?.remove();
    await mountView();
    await act(async () => { await lastTimelineProps().onAfterAction!("submit"); });
    expect(mockNavigate).toHaveBeenCalledWith("/expense/list?status=draft");
  });

  it("does not navigate when the user left the page while the next-draft lookup was in flight (U-621 re-review P2)", async () => {
    let releaseList!: () => void;
    const listHeld = new Promise<void>((resolve) => { releaseList = resolve; });
    mockGetList.mockImplementation((path: string) =>
      String(path).startsWith("/api/v1/get/expenses?status=draft")
        ? listHeld.then(() => ({ data: [sampleExpense({ public_id: "exp-next", status: "draft" })], count: 1 }))
        : Promise.resolve({ data: [] }));
    await mountView();
    let done!: Promise<void>;
    await act(async () => { done = lastTimelineProps().onAfterAction!("submit") as Promise<void>; });
    await act(async () => { lastRoot!.unmount(); });
    lastRoot = null;
    await act(async () => { releaseList(); await done; });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("after a submit with no drafts left, returns to the Draft tab", async () => {
    await mountView();
    await act(async () => { await lastTimelineProps().onAfterAction!("submit"); });
    expect(mockNavigate).toHaveBeenCalledWith("/expense/list?status=draft");
  });

  it("does not navigate after advance/decline", async () => {
    await mountView();
    await act(async () => { await lastTimelineProps().onAfterAction!("advance"); });
    await act(async () => { await lastTimelineProps().onAfterAction!("decline"); });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("a same-row refetch (new item object, same id) does not re-run the line-item/receipt chain", async () => {
    mockGetList.mockResolvedValue({ data: [sampleLineItem()] });
    const root = await mountView();
    const listCalls = mockGetList.mock.calls.length;
    expect(listCalls).toBeGreaterThan(0);

    viewState.item = sampleExpense({ status: "submitted", is_draft: true, row_version: "rv-2" });
    const { default: ExpenseView } = await import("./ExpenseView");
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: ["/expense/exp-1"] },
          createElement(Routes, null, createElement(Route, { path: "/expense/:publicId", element: createElement(ExpenseView) })),
        ),
      );
    });
    await flushEffects();
    expect(mockGetList.mock.calls.length).toBe(listCalls);
  });
});

describe("ExpenseView — working the queue is not a one-shot (Pass 1 P1, 2026-10-04)", () => {
  beforeEach(() => {
    viewState.item = sampleExpense({ public_id: "exp-1", status: "draft", is_draft: true });
    viewState.loading = false;
    viewState.error = "";
    mockGetList.mockReset();
    mockGetOne.mockReset();
    mockNavigate.mockReset();
    mockToast.mockReset();
    mockReviewTimeline.mockClear();
    mockGetOne.mockResolvedValue({});
  });

  afterEach(async () => {
    if (lastRoot) {
      await act(async () => { lastRoot!.unmount(); });
      lastRoot = null;
    }
    lastContainer?.remove();
  });

  it("a second submit after navigating to the next draft (keyed remount) still opens the following draft", async () => {
    const queue = ["exp-2", "exp-3"];
    mockGetList.mockImplementation((path: string) => {
      if (String(path).startsWith("/api/v1/get/expenses?status=draft")) {
        const next = queue.shift();
        return Promise.resolve({ data: next ? [sampleExpense({ public_id: next, status: "draft" })] : [], count: queue.length });
      }
      return Promise.resolve({ data: [] });
    });

    const ORIGIN = "/expense/list?status=completed&from=2026-01-01";
    const rr = (await import("react-router-dom")) as unknown as {
      __realUseNavigate: () => (to: string, opts?: { state?: unknown }) => void;
    };
    let realNavigate: ((to: string, opts?: { state?: unknown }) => void) | null = null;
    function NavigateProbe() {
      realNavigate = rr.__realUseNavigate();
      return null;
    }
    // Follow the app's navigation for real — path AND state — so the second
    // hop reads its returnTo from the location the first hop produced.
    mockNavigate.mockImplementation((to: string, opts?: { state?: unknown }) => {
      const publicId = to.split("/").pop()!;
      viewState.item = sampleExpense({ public_id: publicId, status: "draft", is_draft: true });
      realNavigate?.(to, opts);
    });

    const { default: ExpenseViewRoute } = await import("./ExpenseViewRoute");
    const container = document.createElement("div");
    lastContainer = container;
    document.body.appendChild(container);
    const root = createRoot(container);
    lastRoot = root;
    viewState.item = sampleExpense({ public_id: "exp-1", status: "draft", is_draft: true });
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          { initialEntries: [{ pathname: "/expense/exp-1", state: { returnTo: ORIGIN } }] },
          createElement(NavigateProbe),
          createElement(
            Routes,
            null,
            createElement(Route, { path: "/expense/:publicId", element: createElement(ExpenseViewRoute) }),
          ),
        ),
      );
    });
    await flushEffects();

    await act(async () => { await lastTimelineProps().onAfterAction!("submit"); });
    expect(mockNavigate).toHaveBeenLastCalledWith("/expense/exp-2", { state: { returnTo: ORIGIN } });
    await flushEffects();
    // The keyed remount really happened: the breadcrumb is exp-2's and still points at the origin.
    expect((lastTimelineProps() as { parentPublicId?: string }).parentPublicId).toBe("exp-2");
    const crumb = Array.from(lastContainer.querySelectorAll("a")).find((a) => a.textContent?.trim() === "Expenses");
    expect(crumb?.getAttribute("href")).toBe(ORIGIN);

    await act(async () => { await lastTimelineProps().onAfterAction!("submit"); });
    expect(mockNavigate).toHaveBeenLastCalledWith("/expense/exp-3", { state: { returnTo: ORIGIN } });
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });
});
