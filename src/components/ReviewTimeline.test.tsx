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

function render(
  parentType: "bill" | "invoice" = "bill",
  parentPublicId = "bill-1",
  extraProps: { onBeforeAction?: () => Promise<boolean> } = {},
) {
  act(() => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ReviewTimeline, { parentType, parentPublicId, ...extraProps }),
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

describe("ReviewTimeline — onBeforeAction (U-487)", () => {
  it("POSTs without onBeforeAction — same behaviour as before the prop existed", async () => {
    render();
    await submitForReview();
    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/submit/review/bill/bill-1",
      expect.objectContaining({ comments: null }),
    );
  });

  it("awaits onBeforeAction and aborts the review POST when it returns false", async () => {
    const onBeforeAction = vi.fn().mockResolvedValue(false);
    render("bill", "bill-1", { onBeforeAction });
    await submitForReview();
    expect(onBeforeAction).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("awaits onBeforeAction and POSTs when it returns true", async () => {
    const onBeforeAction = vi.fn().mockResolvedValue(true);
    render("bill", "bill-1", { onBeforeAction });
    await submitForReview();
    expect(onBeforeAction).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalled();
  });
});

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

describe("ReviewTimeline — U-463 the headline names the submitter", () => {
  /**
   * It used to read `by {fullName(current)}` — the most recent row — which for
   * a submitted bill is the pipeline's auto-advance into "In Review". Every
   * bill a person submitted displayed "In Review · by Claude Agent" at the top
   * of its timeline. Reported 2026-09-15.
   */
  const review = (over: Record<string, unknown> = {}) => ({
    id: 1, public_id: "rv-1", row_version: "x",
    created_datetime: "2026-09-15 10:00:00", modified_datetime: null,
    review_status_id: 1, user_id: 17, comments: null,
    bill_id: 1, expense_id: null, bill_credit_id: null, invoice_id: null,
    status_name: "Submitted", status_sort_order: 10,
    status_is_final: false, status_is_declined: false, status_is_initial: true,
    status_color: null, review_kind: "submitted",
    user_firstname: "Christopher", user_lastname: "Zubrod",
    ...over,
  });

  it("names the SUBMITTER even when the latest row belongs to someone else", async () => {
    // Newest-first, exactly as the API returns them.
    mockGetList.mockResolvedValue({
      data: [
        review({ id: 2, public_id: "rv-2", status_name: "In Review",
                 review_kind: "in_review", status_is_initial: false,
                 user_id: 33, user_firstname: "Claude", user_lastname: "Agent" }),
        review(),
      ],
      count: 2,
    });
    render();
    await flushUntil(() => container.textContent?.includes("submitted by") ?? false);

    expect(container.textContent).toContain("submitted by Christopher Zubrod");
    expect(container.textContent).not.toContain("submitted by Claude Agent");
  });

  it("keys on the FROZEN review_kind, not the live is_initial flag", async () => {
    /* `status_is_initial` is live ReviewStatus config and moves when the
       initial role is reassigned — the exact class U-455 froze `review_kind`
       to prevent. Here the flags are misleading and the frozen kind is right. */
    mockGetList.mockResolvedValue({
      data: [
        review({ id: 2, public_id: "rv-2", status_name: "In Review",
                 review_kind: "in_review", status_is_initial: true,   // live flag LIES
                 user_id: 33, user_firstname: "Claude", user_lastname: "Agent" }),
        review({ status_is_initial: false }),                          // frozen kind is right
      ],
      count: 2,
    });
    render();
    await flushUntil(() => container.textContent?.includes("submitted by") ?? false);

    expect(container.textContent).toContain("submitted by Christopher Zubrod");
  });

  it("names whoever RESUBMITTED after a decline, not the original submitter", async () => {
    mockGetList.mockResolvedValue({
      data: [
        review({ id: 4, public_id: "rv-4", status_name: "Submitted",
                 review_kind: "submitted", user_id: 20,
                 user_firstname: "Austin", user_lastname: "Rogers" }),
        review({ id: 3, public_id: "rv-3", status_name: "Declined",
                 review_kind: "declined", status_is_declined: true, status_is_initial: false }),
        review({ id: 1 }),
      ],
      count: 3,
    });
    render();
    await flushUntil(() => container.textContent?.includes("submitted by") ?? false);

    expect(container.textContent).toContain("submitted by Austin Rogers");
  });
});
