/**
 * Expenses page status tabs (U-470).
 *
 * The canonical lifecycle vocabulary from U-357 §9a, filtered SERVER-SIDE via
 * `?status=` against the stored `Expense.Status` column (U-467). Filtering in
 * SQL is what keeps `count` honest — post-filtering an already-paginated page
 * would make the results chip describe a different set than the rows (U-447).
 *
 * Extracted from ExpenseList.tsx so the parts worth testing are testable
 * without mounting the full list page.
 */

export type ExpenseStatusTab =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "declined"
  | "completed";

export const STATUS_TABS: { value: ExpenseStatusTab; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "completed", label: "Completed" },
];

/**
 * There is deliberately no "All" tab — same product decision as Bills
 * (Chris, 2026-09-11). Default is `completed`: expenses arrive from the QBO
 * pull already `completed` and acquire no review on creation (unlike Bill,
 * whose `create` auto-writes a Submitted review), so `in_review` is empty
 * in practice. Measured 2026-09-17: 10 draft / 11,808 completed / 0 expense
 * reviews. Bill's identical-looking default is correct for Bill.
 *
 * Interim: actionable vs settled is GL coding (the 58999 queue), not a
 * lifecycle status. Durable fix: build.one.api `docs/design/u477-expense-surface-merge.md` (Phase 1).
 */
export const DEFAULT_STATUS_TAB: ExpenseStatusTab = "completed";

export function isStatusTab(value: string | null | undefined): value is ExpenseStatusTab {
  return STATUS_TABS.some((o) => o.value === value);
}

/** The tab a `?status=` URL param selects — falling back rather than 404-ing on junk. */
export function resolveStatusTab(param: string | null | undefined): ExpenseStatusTab {
  return isStatusTab(param) ? param : DEFAULT_STATUS_TAB;
}

/**
 * The query string appended to `/api/v1/get/expenses`.
 *
 * Always `?status=`. The API rejects an unknown status with a 422 rather than
 * silently returning everything, which is why `resolveStatusTab` normalises
 * before we get here.
 */
export function expenseListQuery(tab: ExpenseStatusTab): string {
  return `?status=${tab}`;
}


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
