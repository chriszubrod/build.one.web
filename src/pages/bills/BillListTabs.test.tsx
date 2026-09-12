/**
 * U-451 wiring test: the tab the user is on must reach the API.
 *
 * `billStatusTabs.test.ts` proves the vocabulary and the query-string helper in
 * isolation; it cannot prove BillList USES them. A page that renders six tabs
 * and then fetches `?is_draft=true` regardless would pass that suite and show
 * identical rows under every heading.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Every URL BillList asked usePaginatedList for, in order. */
const requestedUrls: string[] = [];

/** Rows the mocked hook hands back, and the search term it reports. */
let mockItems: unknown[] = [];
let mockTotal = 0;
let mockSearch = "";
let mockLoading = false;
let mockPage = 1;
const setSearchSpy = vi.fn();
const setPageSpy = vi.fn();

vi.mock("../../hooks/usePaginatedList", () => ({
  usePaginatedList: (url: string) => {
    requestedUrls.push(url);
    return {
      items: mockItems, total: mockTotal, page: mockPage, pageSize: 50,
      totalPages: 1, loading: mockLoading, error: "",
      setPage: setPageSpy, setSearch: setSearchSpy, search: mockSearch,
      reload: vi.fn(),
    };
  },
}));

// The real hook returns a Map; `{}` silently passed only while `items` was
// empty and `.map()` never ran.
vi.mock("../../hooks/useIdNameMap", () => ({
  useIdNameMap: () => new Map<number, string>([[10, "Acme Supply"]]),
}));
vi.mock("../../api/client", () => ({
  uploadFile: vi.fn(), getOne: vi.fn().mockResolvedValue({}), rawRequest: vi.fn(),
}));

let lastContainer: HTMLDivElement;

async function mountAt(path: string): Promise<Root> {
  const { default: BillList } = await import("./BillList");
  const container = document.createElement("div");
  lastContainer = container;
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client: new QueryClient() },
        createElement(MemoryRouter, { initialEntries: [path] },
          createElement(BillList))),
    );
  });
  return root;
}

describe("BillList status tabs reach the API (U-451)", () => {
  beforeEach(() => {
    requestedUrls.length = 0;
    mockItems = [];
    mockTotal = 0;
    mockSearch = "";
    mockLoading = false;
    mockPage = 1;
    setSearchSpy.mockClear();
    setPageSpy.mockClear();
  });

  it("defaults to in_review when the URL carries no status", async () => {
    await mountAt("/bills");
    expect(requestedUrls.at(-1)).toBe("/api/v1/get/bills?status=in_review");
  });

  it("honours the status in the URL", async () => {
    await mountAt("/bills?status=completed");
    expect(requestedUrls.at(-1)).toBe("/api/v1/get/bills?status=completed");
  });

  it("normalises a stale or junk status instead of forwarding it", async () => {
    // `finalized` was a real value in the OLD dropdown, so stale bookmarks and
    // links carry it. The API 422s anything unknown, so forwarding it would
    // break the page rather than degrade it.
    await mountAt("/bills?status=finalized");
    expect(requestedUrls.at(-1)).toBe("/api/v1/get/bills?status=in_review");
  });

  it("NEVER queries is_draft", async () => {
    for (const p of ["/bills", "/bills?status=draft", "/bills?status=declined"]) {
      requestedUrls.length = 0;
      await mountAt(p);
      expect(requestedUrls.join(" ")).not.toContain("is_draft");
    }
  });

  it("renders the six tabs, in lifecycle order, with the active one selected", async () => {
    await mountAt("/bills?status=declined");
    const tabs = Array.from(lastContainer.querySelectorAll('[role="tab"]'));
    expect(tabs.map((el) => el.textContent)).toEqual([
      "Draft", "Submitted", "In Review", "Approved", "Declined", "Completed",
    ]);
    const selected = tabs.filter((el) => el.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toBe("Declined");
  });

  it("no longer renders the old status dropdown", async () => {
    // The <select> and the tabs must not both ship — two controls driving the
    // same filter is how they end up disagreeing.
    await mountAt("/bills");
    expect(lastContainer.querySelector("select.table-filter-select")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // U-452 — Labor's card layout
  // -------------------------------------------------------------------------

  it("renders bills as cards, not as a data table", async () => {
    mockItems = [
      { public_id: "b1", bill_number: "INV-1", bill_date: "2026-09-01",
        total_amount: "1250.00", is_draft: true, status: "in_review",
        vendor_id: 10, review_status: "In Review" },
    ];
    mockTotal = 1;
    await mountAt("/bills?status=in_review");
    expect(lastContainer.querySelector("table.data-table")).toBeNull();
    expect(lastContainer.querySelectorAll(".entry-card")).toHaveLength(1);
  });

  it("puts the lifecycle badge on the card", async () => {
    // EntryCard had no badge slot; Bills need one, so it grew an optional
    // trailing slot. Labor passes nothing and is unaffected.
    mockItems = [
      { public_id: "b1", bill_number: "INV-1", bill_date: "2026-09-01",
        total_amount: "10.00", is_draft: false, status: "completed", vendor_id: 10 },
    ];
    mockTotal = 1;
    await mountAt("/bills?status=completed");
    const badge = lastContainer.querySelector(".entry-card-badge .status-badge");
    expect(badge?.textContent).toBe("Completed");
  });

  it("sends the date bounds to the API, not to a client-side filter", async () => {
    // LaborList filters its fully-fetched set in the browser. That shape cannot
    // work on a paginated list: narrowing a page in JS would leave `count`
    // describing the unfiltered set — the inconsistency U-447 removed.
    await mountAt("/bills?status=draft&from=2026-01-01&to=2026-03-31");
    const url = requestedUrls.at(-1)!;
    expect(url).toContain("start_date=2026-01-01");
    expect(url).toContain("end_date=2026-03-31");
  });

  it("omits an unset date bound entirely", async () => {
    await mountAt("/bills?status=draft&from=2026-01-01");
    const url = requestedUrls.at(-1)!;
    expect(url).toContain("start_date=2026-01-01");
    expect(url).not.toContain("end_date");
  });

  it("shows the section label for the active tab", async () => {
    await mountAt("/bills?status=approved");
    expect(lastContainer.querySelector(".section-label-prose")?.textContent)
      .toContain("Approved, awaiting completion");
  });

  it("shows per-tab empty copy rather than a bare 'no bills found'", async () => {
    await mountAt("/bills?status=in_review");
    expect(lastContainer.textContent).toContain("Nothing in review.");
  });

  it("treats the tab as NOT an active filter", async () => {
    // The tab always has a value. Counting it would leave Clear permanently
    // enabled and the count chip permanently on.
    mockItems = [{ public_id: "b1", vendor_id: 10, is_draft: true, status: "draft" }];
    mockTotal = 1;
    await mountAt("/bills?status=draft");
    const clear = Array.from(lastContainer.querySelectorAll("button"))
      .find((b) => b.textContent === "Clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
    expect(lastContainer.querySelector(".list-count")).toBeNull();
  });

  it("enables Clear and the count chip once a real filter is set", async () => {
    mockItems = [{ public_id: "b1", vendor_id: 10, is_draft: true, status: "draft" }];
    mockTotal = 40;
    await mountAt("/bills?status=draft&from=2026-01-01");
    const clear = Array.from(lastContainer.querySelectorAll("button"))
      .find((b) => b.textContent === "Clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    expect(lastContainer.querySelector(".list-count")?.textContent).toBe("1 of 40");
  });

  it("Clear drops the date bounds AND the search term", async () => {
    // A mutation check found this gap: nothing exercised the Clear button, so
    // a version that reset the search but left `from`/`to` in the URL — and
    // therefore in the API query — passed the whole suite while the button
    // visibly did nothing.
    mockItems = [{ public_id: "b1", vendor_id: 10, is_draft: true, status: "draft" }];
    mockTotal = 1;
    mockSearch = "acme";
    await mountAt("/bills?status=draft&from=2026-01-01&to=2026-03-31");
    expect(requestedUrls.at(-1)).toContain("start_date=2026-01-01");

    const clear = Array.from(lastContainer.querySelectorAll("button"))
      .find((b) => b.textContent === "Clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(false);

    await act(async () => { clear.click(); });

    expect(setSearchSpy).toHaveBeenCalledWith("");
    const after = requestedUrls.at(-1)!;
    expect(after).not.toContain("start_date");
    expect(after).not.toContain("end_date");
    // ...and the tab survives, because Clear is for filters, not navigation
    expect(after).toContain("status=draft");
  });

  it("keeps the Review badge the table had as its own column", async () => {
    // Found by my own audit, not by a test: the card conversion silently
    // dropped it. `review_status` is the ADMIN-EDITABLE stage name, so once
    // someone adds a custom stage it is the only place that stage is visible —
    // the lifecycle badge collapses every intermediate one to "In Review".
    mockItems = [
      { public_id: "b1", bill_number: "INV-1", bill_date: "2026-09-01",
        total_amount: "10.00", is_draft: true, status: "in_review",
        vendor_id: 10, review_status: "Owner Review",
        review_status_kind: "in_review" },
    ];
    mockTotal = 1;
    await mountAt("/bills?status=in_review");
    const badges = Array.from(
      lastContainer.querySelectorAll(".entry-card-badge .status-badge"),
    ).map((b) => b.textContent);
    expect(badges).toEqual(["In Review", "Owner Review"]);
  });

  it("omits the Review badge when it would just repeat the status", async () => {
    mockItems = [
      { public_id: "b1", bill_number: "INV-1", bill_date: "2026-09-01",
        total_amount: "10.00", is_draft: true, status: "in_review",
        vendor_id: 10, review_status: "In Review",
        review_status_kind: "in_review" },
    ];
    mockTotal = 1;
    await mountAt("/bills?status=in_review");
    const badges = Array.from(
      lastContainer.querySelectorAll(".entry-card-badge .status-badge"),
    ).map((b) => b.textContent);
    expect(badges).toEqual(["In Review"]);
  });

  // -------------------------------------------------------------------------
  // Codex round 1
  // -------------------------------------------------------------------------

  it("resets a persisted out-of-range page instead of claiming no matches", async () => {
    // `page` is persisted in sessionStorage and shared across every tab/date
    // combination, but only INTERACTIVE changes reset it. Open a shared
    // /bills?status=draft link after last leaving Completed on page 40 and the
    // API answers with a real total and an EMPTY page — the UI then says "no
    // bills match" while bills plainly match.
    mockItems = [];
    mockTotal = 137;
    mockPage = 40;
    await mountAt("/bills?status=in_review");
    expect(setPageSpy).toHaveBeenCalledWith(1);
  });

  it("does not reset the page when the filter genuinely matches nothing", async () => {
    mockItems = [];
    mockTotal = 0;
    mockPage = 3;
    await mountAt("/bills?status=approved");
    expect(setPageSpy).not.toHaveBeenCalled();
  });

  it("changing a filter always returns to page 1", async () => {
    mockItems = [{ public_id: "b1", vendor_id: 10, is_draft: true, status: "draft" }];
    mockTotal = 1;
    await mountAt("/bills?status=draft");
    setPageSpy.mockClear();
    const from = lastContainer.querySelector(
      'input[aria-label="Bill date from"]',
    ) as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value",
      )!.set!;
      setter.call(from, "2026-02-01");
      from.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(setPageSpy).toHaveBeenCalledWith(1);
  });

  it("shows Loading rather than the previous tab's bills", async () => {
    // usePaginatedList keeps staleWhileRevalidate items on a cache MISS — it
    // sets loading but never clears `items` — so a tab switch briefly rendered
    // the OLD tab's bills under the NEW tab's heading.
    mockItems = [
      { public_id: "stale", bill_number: "OLD-1", bill_date: "2026-01-01",
        total_amount: "1.00", is_draft: true, status: "in_review", vendor_id: 10 },
    ];
    mockTotal = 1;
    mockLoading = true;
    // A search term is REQUIRED for this test to mean anything. BillList has an
    // early return — `if (loading && page === 1 && !search)` — that short-
    // circuits the whole render, so with no search the assertion passes even
    // when the guard under test is deleted. A mutation check caught exactly
    // that: this test was green against the broken implementation.
    mockSearch = "acme";
    await mountAt("/bills?status=completed");
    expect(lastContainer.querySelectorAll(".entry-card")).toHaveLength(0);
    expect(lastContainer.textContent).toContain("Loading");
  });

  it("ignores a malformed date in the URL instead of applying it invisibly", async () => {
    // `<input type="date">` cannot render `01/01/2026`, and the API types these
    // as `date` so it is a 422 — an active filter nobody can see, on a request
    // that fails.
    await mountAt("/bills?status=draft&from=01/01/2026&to=2026-13-45");
    const url = requestedUrls.at(-1)!;
    expect(url).not.toContain("start_date");
    expect(url).not.toContain("end_date");
    const clear = Array.from(lastContainer.querySelectorAll("button"))
      .find((b) => b.textContent === "Clear") as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
  });
});
