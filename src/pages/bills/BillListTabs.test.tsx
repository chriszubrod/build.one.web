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

vi.mock("../../hooks/usePaginatedList", () => ({
  usePaginatedList: (url: string) => {
    requestedUrls.push(url);
    return {
      items: [], total: 0, page: 1, pageSize: 50, totalPages: 0,
      loading: false, error: "", setPage: vi.fn(), setSearch: vi.fn(),
      search: "", reload: vi.fn(),
    };
  },
}));

vi.mock("../../hooks/useIdNameMap", () => ({ useIdNameMap: () => ({}) }));
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
  beforeEach(() => { requestedUrls.length = 0; });

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
});
