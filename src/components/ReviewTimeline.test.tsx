import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReviewTimeline from "./ReviewTimeline";
import { entityItemKey } from "../hooks/useEntity";
import { flushUntil } from "../__testutils__/flush";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * U-464 — a review action must tell the surrounding page that the parent moved.
 *
 * THE BUG, reported live twice on 2026-09-15. A review transition WRITES THE
 * PARENT ROW — `CreateReview` sets the parent's Status — which bumps its
 * ROWVERSION. This component holds its own local state (`useState`, `getList`,
 * `post`) and used to refresh only ITSELF after an action, so the page around it
 * never learned the row had moved. Its edit form kept the pre-action
 * concurrency token, and the next save came back 409 "Concurrency violation".
 * Approve a bill, click Complete, get an error — every time.
 *
 * Invalidating the parent's item query is half the fix; the page then has to act
 * on the fresh data (see BillEdit's server-owned-field rebase specs). This file
 * covers the half that lives here.
 */

const mockGetList = vi.fn();
const mockPost = vi.fn();
const mockMe = vi.fn();

vi.mock("../api/client", () => ({
  getList: (...a: unknown[]) => mockGetList(...a),
  post: (...a: unknown[]) => mockPost(...a),
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

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mockMe(),
}));

/** System admin — bypasses the module permission check in shared/permissions. */
const ADMIN = { data: { is_admin: true, is_system_admin: true, modules: [] } };

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

function render(parentType: "bill" | "invoice" = "bill", parentPublicId = "bill-1") {
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ReviewTimeline, { parentType, parentPublicId }),
      ),
    );
  });
}

const buttonWithText = (label: string) =>
  Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );

beforeEach(() => {
  vi.useFakeTimers();   // flushUntil advances timers; see web CLAUDE.md U-152 rule 2
  mockGetList.mockReset();
  mockPost.mockReset();
  mockMe.mockReset();
  mockMe.mockReturnValue(ADMIN);
  // No reviews yet -> the component offers "Submit for Review".
  mockGetList.mockResolvedValue({ data: [], count: 0 });
  mockPost.mockResolvedValue({});
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function submitForReview() {
  await flushUntil(() => buttonWithText("Submit for Review") !== undefined);
  await act(async () => {
    buttonWithText("Submit for Review")!.click();
  });
  // The dialog's confirm button carries the same label as the action title.
  await flushUntil(() => buttonWithText("Submit for Review") !== undefined);
  const buttons = Array.from(container.querySelectorAll("button")).filter(
    (b) => b.textContent?.trim() === "Submit for Review",
  );
  await act(async () => {
    buttons[buttons.length - 1].click();
  });
  await flushUntil(() => mockPost.mock.calls.length > 0);
}

describe("ReviewTimeline — U-464 parent invalidation", () => {
  it("invalidates the PARENT's item query after a review action", async () => {
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    render();
    await submitForReview();

    // Hard precondition — asserts nothing unless the action really posted.
    expect(mockPost).toHaveBeenCalled();
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(entityItemKey("/api/v1/get/bill/bill-1")));
  });

  it("uses the parent's OWN slug, not the bill one", async () => {
    /* `URL_SLUG` exists because three of four parents match snake_case while
       bill_credit is hyphenated on the API surface. Invalidating the wrong key
       would be a silent no-op — the page would stay stale and the 409 would
       come back, with nothing to show for the fix. */
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    render("invoice", "inv-9");
    await submitForReview();

    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(entityItemKey("/api/v1/get/invoice/inv-9")));
    expect(keys).not.toContain(JSON.stringify(entityItemKey("/api/v1/get/bill/inv-9")));
  });

  it("does NOT invalidate when the action failed", async () => {
    /* A failed transition did not move the parent. Invalidating anyway would
       throw away good cached data and hide the failure behind a refetch. */
    mockPost.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    render();
    await submitForReview();

    expect(mockPost).toHaveBeenCalled();
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).not.toContain(JSON.stringify(entityItemKey("/api/v1/get/bill/bill-1")));
  });
});
