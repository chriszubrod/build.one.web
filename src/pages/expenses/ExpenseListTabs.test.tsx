/**
 * U-470 wiring test: the tab the user is on must reach the API.
 *
 * `expenseStatusTabs.test.ts` proves the vocabulary and the query-string helper
 * in isolation; it cannot prove ExpenseList USES them. A page that renders six
 * tabs and then fetches `/api/v1/get/expenses` with no `?status=` would pass
 * that suite and show identical rows under every heading.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setInputValue } from "../../__testutils__/domEvents";
import { flushUntil } from "../../__testutils__/flush";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Modules } from "../../shared/modules";
import { makeModule, makeUserWithModules } from "../../__testutils__/currentUser";
import type { CurrentUser } from "../../types/api";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const listHarness = vi.hoisted(() => {
  const adminUser: CurrentUser = {
    is_admin: true,
    modules: [],
    auth: { public_id: "a", username: "admin" },
    user: { id: 1, public_id: "u", firstname: "A", lastname: "D" },
    role: null,
    accessible_project_ids: [],
  };
  return {
    mockReload: vi.fn(),
    currentUser: adminUser,
    adminUser,
  };
});

const mockUploadFile = vi.fn();
const mockPost = vi.fn();

vi.mock("../../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../api/client")>();
  return {
    ...mod,
    uploadFile: (...args: unknown[]) => mockUploadFile(...args),
    post: (...args: unknown[]) => mockPost(...args),
  };
});

/** Every URL ExpenseList asked usePaginatedList for, in order. */
const requestedUrls: string[] = [];

/** Rows the mocked hook hands back, and the search term it reports. */
let mockItems: unknown[] = [];
let mockTotal = 0;
let mockSearch = "";
let mockLoading = false;
let mockRefreshing = false;
let mockError = "";
let mockPage = 1;
const setSearchSpy = vi.fn();
const setPageSpy = vi.fn();

vi.mock("../../hooks/usePaginatedList", () => ({
  usePaginatedList: (url: string) => {
    requestedUrls.push(url);
    return {
      items: mockItems, total: mockTotal, page: mockPage, pageSize: 50,
      totalPages: 1, loading: mockLoading, refreshing: mockRefreshing, error: mockError,
      setPage: setPageSpy, setSearch: setSearchSpy, search: mockSearch,
      reload: listHarness.mockReload,
    };
  },
}));

vi.mock("../../hooks/useIdNameMap", () => ({
  useIdNameMap: () => new Map<number, string>([[10, "Acme Supply"]]),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    data: listHarness.currentUser,
    isLoading: false,
  }),
}));

let lastContainer: HTMLDivElement;
let lastRoot: Root | null = null;
let lastMountPath = "/expense/list";
let listQueryClient: QueryClient;

async function mountAt(path: string): Promise<Root> {
  lastMountPath = path;
  const { default: ExpenseList } = await import("./ExpenseList");
  const container = document.createElement("div");
  lastContainer = container;
  document.body.appendChild(container);
  const root = createRoot(container);
  lastRoot = root;
  listQueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client: listQueryClient },
        createElement(MemoryRouter, { initialEntries: [path] },
          createElement(ExpenseList))),
    );
  });
  return root;
}

async function rerenderList(): Promise<void> {
  const { default: ExpenseList } = await import("./ExpenseList");
  await act(async () => {
    lastRoot!.render(
      createElement(QueryClientProvider, { client: listQueryClient },
        createElement(MemoryRouter, { initialEntries: [lastMountPath] },
          createElement(ExpenseList))),
    );
  });
}

describe("ExpenseList status tabs reach the API (U-470)", () => {
  beforeEach(() => {
    requestedUrls.length = 0;
    mockItems = [];
    mockTotal = 0;
    mockSearch = "";
    mockLoading = false;
    mockRefreshing = false;
    mockError = "";
    mockPage = 1;
    listHarness.mockReload.mockClear();
    listHarness.currentUser = listHarness.adminUser;
    setSearchSpy.mockClear();
    setPageSpy.mockClear();
  });

  afterEach(async () => {
    if (lastRoot) {
      await act(async () => { lastRoot!.unmount(); });
      lastRoot = null;
    }
    lastContainer?.remove();
  });

  it("defaults to completed when the URL carries no status", async () => {
    await mountAt("/expense/list");
    expect(requestedUrls.at(-1)).toBe("/api/v1/get/expenses?status=completed");
  });

  it("honours the status in the URL", async () => {
    await mountAt("/expense/list?status=completed");
    expect(requestedUrls.at(-1)).toBe("/api/v1/get/expenses?status=completed");
  });

  it("writes the clicked tab into the URL so the API follows", async () => {
    // Round-trip: a tab click must change the query param the list is built
    // from. Honouring `?status=` on mount is only half of it — a control that
    // never writes would leave the URL stuck and every click a no-op.
    await mountAt("/expense/list?status=submitted");
    expect(requestedUrls.at(-1)).toBe("/api/v1/get/expenses?status=submitted");
    const tabs = Array.from(lastContainer.querySelectorAll('[role="tab"]'));
    const completed = tabs.find((el) => el.textContent === "Completed") as HTMLButtonElement;
    await act(async () => { completed.click(); });
    expect(requestedUrls.at(-1)).toBe("/api/v1/get/expenses?status=completed");
  });

  it("returns to page 1 when the tab changes, not just when the page is out of range", async () => {
    // The out-of-range reset effect only rescues the case where the new tab has
    // FEWER pages than the old one. Switch from Completed page 7 to a tab that
    // also has >= 7 pages and items.length > 0, so that effect never fires --
    // you land mid-list under a heading you just clicked.
    //
    // Added by U-470's review: deleting `setPage(1)` from the SegmentedControl
    // onChange left the whole suite green. The nearest existing spec
    // ("changing a filter always returns to page 1") drives the DATE input, not
    // the tab, so it does not cover this path.
    await mountAt("/expense/list?status=submitted");
    setPageSpy.mockClear();
    const tabs = Array.from(lastContainer.querySelectorAll('[role="tab"]'));
    const completed = tabs.find((el) => el.textContent === "Completed") as HTMLButtonElement;
    await act(async () => { completed.click(); });
    expect(setPageSpy).toHaveBeenCalledWith(1);
  });

  it("normalises a stale or junk status instead of forwarding it", async () => {
    await mountAt("/expense/list?status=finalized");
    expect(requestedUrls.at(-1)).toBe("/api/v1/get/expenses?status=completed");
  });

  it("NEVER queries is_draft", async () => {
    for (const p of ["/expense/list", "/expense/list?status=draft", "/expense/list?status=declined"]) {
      requestedUrls.length = 0;
      await mountAt(p);
      expect(requestedUrls.join(" ")).not.toContain("is_draft");
    }
  });

  it("renders the six tabs, in lifecycle order, with the active one selected", async () => {
    await mountAt("/expense/list?status=declined");
    const tabs = Array.from(lastContainer.querySelectorAll('[role="tab"]'));
    expect(tabs.map((el) => el.textContent)).toEqual([
      "Draft", "Submitted", "In Review", "Approved", "Declined", "Completed",
    ]);
    const selected = tabs.filter((el) => el.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toBe("Declined");
  });

  it("no longer renders the old status dropdown", async () => {
    await mountAt("/expense/list");
    expect(lastContainer.querySelector("select.table-filter-select")).toBeNull();
  });

  it("renders expenses as cards, not as a data table", async () => {
    mockItems = [
      { public_id: "e1", reference_number: "EXP-1", expense_date: "2026-09-01",
        total_amount: "1250.00", is_draft: true, status: "in_review",
        vendor_id: 10, is_credit: false, review_status: "In Review" },
    ];
    mockTotal = 1;
    await mountAt("/expense/list?status=in_review");
    expect(lastContainer.querySelector("table.data-table")).toBeNull();
    expect(lastContainer.querySelectorAll(".entry-card")).toHaveLength(1);
  });

  it("puts the lifecycle badge on the card", async () => {
    mockItems = [
      { public_id: "e1", reference_number: "EXP-1", expense_date: "2026-09-01",
        total_amount: "10.00", is_draft: false, status: "completed", vendor_id: 10,
        is_credit: false },
    ];
    mockTotal = 1;
    await mountAt("/expense/list?status=completed");
    const badge = lastContainer.querySelector(".entry-card-badge .status-badge");
    expect(badge?.textContent).toBe("Completed");
  });

  it("sends the date bounds to the API, not to a client-side filter", async () => {
    await mountAt("/expense/list?status=draft&from=2026-01-01&to=2026-03-31");
    const url = requestedUrls.at(-1)!;
    expect(url).toContain("start_date=2026-01-01");
    expect(url).toContain("end_date=2026-03-31");
  });

  it("omits an unset date bound entirely", async () => {
    await mountAt("/expense/list?status=draft&from=2026-01-01");
    const url = requestedUrls.at(-1)!;
    expect(url).toContain("start_date=2026-01-01");
    expect(url).not.toContain("end_date");
  });

  it("shows the section label for the active tab", async () => {
    await mountAt("/expense/list?status=approved");
    expect(lastContainer.querySelector(".section-label-prose")?.textContent)
      .toContain("Approved, awaiting completion");
  });

  it("shows per-tab empty copy rather than a bare 'no expenses found'", async () => {
    await mountAt("/expense/list?status=in_review");
    expect(lastContainer.textContent).toContain("Nothing in review.");
  });

  it("treats the tab as NOT an active filter", async () => {
    mockItems = [{ public_id: "e1", vendor_id: 10, is_draft: true, status: "draft", is_credit: false }];
    mockTotal = 1;
    await mountAt("/expense/list?status=draft");
    const clear = Array.from(lastContainer.querySelectorAll("button"))
      .find((b) => b.textContent === "Clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
    expect(lastContainer.querySelector(".list-count")).toBeNull();
  });

  it("enables Clear and the count chip once a real filter is set", async () => {
    mockItems = [{ public_id: "e1", vendor_id: 10, is_draft: true, status: "draft", is_credit: false }];
    mockTotal = 40;
    await mountAt("/expense/list?status=draft&from=2026-01-01");
    const clear = Array.from(lastContainer.querySelectorAll("button"))
      .find((b) => b.textContent === "Clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    expect(lastContainer.querySelector(".list-count")?.textContent).toBe("1 of 40");
  });

  it("Clear drops the date bounds AND the search term", async () => {
    mockItems = [{ public_id: "e1", vendor_id: 10, is_draft: true, status: "draft", is_credit: false }];
    mockTotal = 1;
    mockSearch = "acme";
    await mountAt("/expense/list?status=draft&from=2026-01-01&to=2026-03-31");
    expect(requestedUrls.at(-1)).toContain("start_date=2026-01-01");

    const clear = Array.from(lastContainer.querySelectorAll("button"))
      .find((b) => b.textContent === "Clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(false);

    await act(async () => { clear.click(); });

    expect(setSearchSpy).toHaveBeenCalledWith("");
    const after = requestedUrls.at(-1)!;
    expect(after).not.toContain("start_date");
    expect(after).not.toContain("end_date");
    expect(after).toContain("status=draft");
  });

  it("keeps the Review badge the table had as its own column", async () => {
    mockItems = [
      { public_id: "e1", reference_number: "EXP-1", expense_date: "2026-09-01",
        total_amount: "10.00", is_draft: true, status: "in_review",
        vendor_id: 10, is_credit: false, review_status: "Owner Review",
        review_status_kind: "in_review" },
    ];
    mockTotal = 1;
    await mountAt("/expense/list?status=in_review");
    const badges = Array.from(
      lastContainer.querySelectorAll(".entry-card-badge .status-badge"),
    ).map((b) => b.textContent);
    expect(badges).toEqual(["In Review", "Owner Review"]);
  });

  it("omits the Review badge when it would just repeat the status", async () => {
    mockItems = [
      { public_id: "e1", reference_number: "EXP-1", expense_date: "2026-09-01",
        total_amount: "10.00", is_draft: false, status: "completed",
        vendor_id: 10, is_credit: false, review_status: "Completed",
        review_status_kind: "approved" },
    ];
    mockTotal = 1;
    await mountAt("/expense/list?status=completed");
    const badges = Array.from(
      lastContainer.querySelectorAll(".entry-card-badge .status-badge"),
    ).map((b) => b.textContent);
    expect(badges).toEqual(["Completed"]);
  });

  it("classes a review badge derived from flags when kind is absent", async () => {
    // Defect a: without `expenseReviewKind`, a payload that only carries the
    // boolean review flags renders a CLASS-LESS badge (`review_status_kind`
    // is undefined → `expenseReviewBadgeClass` returns "").
    mockItems = [
      { public_id: "e1", reference_number: "EXP-1", expense_date: "2026-09-01",
        total_amount: "10.00", is_draft: true, status: "in_review",
        vendor_id: 10, is_credit: false, review_status: "Owner Review",
        review_status_is_declined: true },
    ];
    mockTotal = 1;
    await mountAt("/expense/list?status=in_review");
    const badges = Array.from(
      lastContainer.querySelectorAll(".entry-card-badge .status-badge"),
    );
    expect(badges.map((b) => b.textContent)).toEqual(["In Review", "Owner Review"]);
    expect(badges[1].className.split(/\s+/)).toContain("declined");
  });

  it("resets a persisted out-of-range page instead of claiming no matches", async () => {
    mockItems = [];
    mockTotal = 137;
    mockPage = 40;
    await mountAt("/expense/list?status=in_review");
    expect(setPageSpy).toHaveBeenCalledWith(1);
  });

  it("does not reset the page when the filter genuinely matches nothing", async () => {
    mockItems = [];
    mockTotal = 0;
    mockPage = 3;
    await mountAt("/expense/list?status=approved");
    expect(setPageSpy).not.toHaveBeenCalled();
  });

  it("changing a filter always returns to page 1", async () => {
    mockItems = [{ public_id: "e1", vendor_id: 10, is_draft: true, status: "draft", is_credit: false }];
    mockTotal = 1;
    await mountAt("/expense/list?status=draft");
    setPageSpy.mockClear();
    const from = lastContainer.querySelector(
      'input[aria-label="Expense date from"]',
    ) as HTMLInputElement;
    await act(async () => {
      setInputValue(from, "2026-02-01");
    });
    expect(setPageSpy).toHaveBeenCalledWith(1);
  });

  it("shows Loading rather than the previous tab's expenses", async () => {
    mockItems = [
      { public_id: "stale", reference_number: "OLD-1", expense_date: "2026-01-01",
        total_amount: "1.00", is_draft: true, status: "in_review", vendor_id: 10,
        is_credit: false },
    ];
    mockTotal = 1;
    mockLoading = true;
    mockSearch = "acme";
    await mountAt("/expense/list?status=completed");
    expect(lastContainer.querySelectorAll(".entry-card")).toHaveLength(0);
    expect(lastContainer.textContent).toContain("Loading");
  });

  it("disables Refresh and shows Refreshing… while a background reload is in flight", async () => {
    mockItems = [{ public_id: "e1", vendor_id: 10, is_draft: true, status: "draft", is_credit: false }];
    mockTotal = 1;
    mockRefreshing = true;
    await mountAt("/expense/list?status=draft");
    const refresh = lastContainer.querySelector(
      'button[title="Fetch the latest expenses from the server"]',
    ) as HTMLButtonElement;
    expect(refresh.disabled).toBe(true);
    expect(refresh.textContent).toBe("Refreshing…");
  });

  it("ignores a malformed date in the URL instead of applying it invisibly", async () => {
    await mountAt("/expense/list?status=draft&from=01/01/2026&to=2026-13-45");
    const url = requestedUrls.at(-1)!;
    expect(url).not.toContain("start_date");
    expect(url).not.toContain("end_date");
    const clear = Array.from(lastContainer.querySelectorAll("button"))
      .find((b) => b.textContent === "Clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
  });
});

describe("ExpenseList receipt match panel (U-716b)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    requestedUrls.length = 0;
    mockItems = [{ public_id: "e1", vendor_id: 10, is_draft: true, status: "draft", is_credit: false }];
    mockTotal = 1;
    mockSearch = "";
    mockLoading = false;
    mockRefreshing = false;
    mockError = "";
    mockPage = 1;
    listHarness.mockReload.mockClear();
    listHarness.currentUser = listHarness.adminUser;
    mockUploadFile.mockImplementation(async (_path: string, file: File) => ({
      public_id: `att-${file.name}`,
    }));
    mockPost.mockImplementation(async (path: string) => {
      if (path === "/api/v1/expense/read-receipt") {
        return {
          status: "matched",
          message: null,
          fields: {
            vendor_name: "Acme Supply",
            expense_date: "2026-03-15",
            total_amount: "42.50",
            vendor_public_id: null,
            reference_number: null,
          },
          candidates: [
            {
              public_id: "exp-c1",
              vendor_name: "Acme Supply",
              expense_date: "2026-03-15",
              total_amount: "42.50",
              reference_number: null,
              is_draft: true,
              status: "draft",
              is_completed: false,
              vendor_matches: true,
              days_apart: 0,
            },
          ],
        };
      }
      return {
        expense_public_id: "exp-c1",
        expense_line_item_public_id: "line-1",
        attachment_public_id: "att-r.pdf",
      };
    });
  });

  afterEach(async () => {
    if (lastRoot) {
      await act(async () => { lastRoot!.unmount(); });
      lastRoot = null;
    }
    lastContainer?.remove();
    vi.useRealTimers();
  });

  async function enqueueReceiptPdf() {
    const fileInput = lastContainer.querySelector(".drop-zone input[type='file']") as HTMLInputElement;
    const file = new File(["p"], "r.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await flushUntil(() => lastContainer.querySelector(".receipt-match-candidate") !== null);
  }

  it("shows the drop zone with can_update and hides it with can_create only", async () => {
    await mountAt("/expense/list?status=draft");
    expect(lastContainer.querySelector(".drop-zone")).not.toBeNull();

    listHarness.currentUser = makeUserWithModules([
      makeModule(Modules.EXPENSES, { can_read: true, can_create: true, can_update: false }),
    ]);
    await rerenderList();
    expect(lastContainer.querySelector(".drop-zone")).toBeNull();
  });

  it("keeps receipt match rows visible while the list is loading or in error", async () => {
    await mountAt("/expense/list?status=draft");
    await enqueueReceiptPdf();
    expect(lastContainer.textContent).toContain("Acme Supply");

    mockLoading = true;
    await rerenderList();
    expect(lastContainer.textContent).toContain("Loading");
    expect(lastContainer.querySelector(".receipt-match-candidate")).not.toBeNull();

    mockLoading = false;
    mockError = "Could not load expenses";
    await rerenderList();
    expect(lastContainer.textContent).toContain("Could not load expenses");
    expect(lastContainer.querySelector(".receipt-match-candidate")).not.toBeNull();
  });

  it("calls the list reload after a successful Attach", async () => {
    await mountAt("/expense/list?status=draft");
    await enqueueReceiptPdf();
    const attach = lastContainer.querySelector(".receipt-match-candidate button") as HTMLButtonElement;
    await act(async () => {
      attach.click();
    });
    await flushUntil(() => listHarness.mockReload.mock.calls.length > 0);
    expect(listHarness.mockReload).toHaveBeenCalled();
  });
});
