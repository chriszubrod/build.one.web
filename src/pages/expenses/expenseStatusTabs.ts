/**
 * Expenses page status tabs (U-470).
 *
 * The canonical lifecycle vocabulary from U-357 §9a, filtered SERVER-SIDE via
 * `?status=` against the stored `Expense.Status` column (U-467). The tab list,
 * resolver, query builder and list-path builder are shared with Bills — see
 * `../shared/statusTabs.ts` (U-752), which also carries the rationale for
 * there being no "All" tab and for filtering server-side.
 *
 * Extracted from ExpenseList.tsx so the parts worth testing are testable
 * without mounting the full list page.
 */
import { createStatusTabs, type DocumentStatusTab } from "../shared/statusTabs";

export type ExpenseStatusTab = DocumentStatusTab;

/**
 * There is deliberately no "All" tab — same product decision as Bills
 * (Chris, 2026-09-11).
 *
 * The default tab is `draft`, matching Bills — Chris's decision (2026-11-02,
 * U-752). It used to be `completed`, on the grounds that expenses arrive from
 * the QBO pull already completed (measured 2026-09-17: 10 draft / 11,808
 * completed), which made Completed the only non-empty landing tab. An explicit
 * `?status=` in the URL still wins via `resolveStatusTab`.
 *
 * Interim: actionable vs settled is GL coding (the 58999 queue), not a
 * lifecycle status. Durable fix: build.one.api `docs/design/u477-expense-surface-merge.md` (Phase 1).
 */
const expenseTabs = createStatusTabs({ defaultTab: "draft", listBasePath: "/expense/list" });

export const STATUS_TABS: { value: ExpenseStatusTab; label: string }[] = expenseTabs.STATUS_TABS;
export const DEFAULT_STATUS_TAB: ExpenseStatusTab = expenseTabs.DEFAULT_STATUS_TAB;
export const isStatusTab = expenseTabs.isStatusTab;
export const resolveStatusTab = expenseTabs.resolveStatusTab;

/**
 * The list URL that lands on the tab holding an expense of this status.
 *
 * ExpenseView's breadcrumb used to point at a bare `/expense/list`, which
 * `resolveStatusTab(null)` reads as the default tab — so every trip back from
 * a non-default status dropped the user on the wrong tab. Unknown statuses
 * fall back to the default tab exactly like the URL param does.
 */
export const expenseListPath = expenseTabs.listPath;

/** The query string appended to `/api/v1/get/expenses` — always `?status=`. */
export const expenseListQuery = expenseTabs.listQuery;


/** Section heading under the tabs — LaborList's `SECTION_LABEL` equivalent. */
export const SECTION_LABEL: Record<ExpenseStatusTab, string> = {
  draft: "Draft",
  submitted: "Submitted for review",
  in_review: "In review",
  approved: "Approved, awaiting completion",
  declined: "Declined",
  completed: "Completed",
};

/**
 * Per-tab empty copy. A blank table cell reading "No expenses found" cannot
 * tell an empty queue from a broken filter, and three of these tabs are
 * legitimately empty most of the time.
 */
export const EMPTY_COPY: Record<ExpenseStatusTab, string> = {
  draft: "No draft expenses. An expense enters review as soon as it is created, so this is normally empty.",
  submitted: "Nothing awaiting a first review.",
  in_review: "Nothing in review.",
  approved: "Nothing approved and waiting to be completed.",
  declined: "Nothing declined.",
  completed: "No completed expenses.",
};

export const NO_MATCH_COPY = "No expenses match these filters.";


/**
 * `<input type="date">` can only display `YYYY-MM-DD`, and the API now types
 * these as `date` so anything else is a 422. A shared or hand-edited URL
 * carrying `?from=01/01/2026` would otherwise apply an ACTIVE filter that the
 * control renders blank — invisible, and it breaks the request. Ignore what
 * we cannot both show and send.
 */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // U-470: compare the CALENDAR fields, never a UTC round-trip.
  //
  // The previous form did `new Date(\`${value}T00:00:00\`)` — parsed as LOCAL
  // midnight — and compared `.toISOString()` back, which is UTC. In any
  // UTC-POSITIVE zone local midnight is the previous day in UTC, so this
  // returned false for every well-formed date: verified false in Europe/Berlin,
  // Asia/Tokyo, Australia/Sydney and Europe/London under BST. The From/To
  // filters then went silently INERT for those users — blank inputs, no
  // start_date/end_date on the request, Clear disabled, and no error anywhere.
  // It also made this suite timezone-dependent (4 specs fail under
  // TZ=Europe/Berlin) with no TZ pinned in vitest config.
  //
  // Date.UTC normalises, so an out-of-range day like 2026-02-31 rolls over and
  // fails the round-trip, which is the real check we wanted.
  const utc = new Date(Date.UTC(y, mo - 1, d));
  return (
    utc.getUTCFullYear() === y &&
    utc.getUTCMonth() === mo - 1 &&
    utc.getUTCDate() === d
  );
}
