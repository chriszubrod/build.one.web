/**
 * Bills page status tabs (U-451).
 *
 * The canonical lifecycle vocabulary from U-357 §9a, filtered SERVER-SIDE via
 * `?status=` against the stored `Bill.Status` column (U-445). Filtering in SQL
 * is what keeps `count` honest — post-filtering an already-paginated page would
 * make the results chip describe a different set than the rows.
 *
 * Extracted from BillList.tsx so the parts worth testing are testable without
 * mounting a component that also owns drag-and-drop uploads and folder polling.
 */

export type BillStatusTab =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "declined"
  | "completed";

export const STATUS_TABS: { value: BillStatusTab; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "completed", label: "Completed" },
];

/**
 * There is deliberately no "All" tab (Chris, 2026-09-11), and that has a
 * consequence worth stating: before U-451 this page defaulted to
 * `?is_draft=true`, which showed every in-flight bill in ONE view. Those now
 * split across Submitted / In Review / Declined.
 *
 * So the default is `in_review` — the largest in-flight queue and the one AP
 * actions. Defaulting to `draft` (the previous default's name) would open an
 * EMPTY page: a bill acquires a Review the moment it is created, so nothing
 * rests at `draft` in production.
 */
export const DEFAULT_STATUS_TAB: BillStatusTab = "in_review";

export function isStatusTab(value: string | null | undefined): value is BillStatusTab {
  return STATUS_TABS.some((o) => o.value === value);
}

/** The tab a `?status=` URL param selects — falling back rather than 404-ing on junk. */
export function resolveStatusTab(param: string | null | undefined): BillStatusTab {
  return isStatusTab(param) ? param : DEFAULT_STATUS_TAB;
}

/**
 * The query string appended to `/api/v1/get/bills`.
 *
 * Always `?status=`, never `?is_draft=`: the old parameter could express only
 * two of the six states, so Submitted, In Review and Declined were all
 * indistinguishably "draft". The API rejects an unknown status with a 422
 * rather than silently returning everything, which is why `resolveStatusTab`
 * normalises before we get here.
 */
export function billListQuery(tab: BillStatusTab): string {
  return `?status=${tab}`;
}


/** Section heading under the tabs — LaborList's `SECTION_LABEL` equivalent. */
export const SECTION_LABEL: Record<BillStatusTab, string> = {
  draft: "Draft",
  submitted: "Submitted for review",
  in_review: "In review",
  approved: "Approved, awaiting completion",
  declined: "Declined",
  completed: "Completed",
};

/**
 * Per-tab empty copy. A blank table cell reading "No bills found" cannot tell
 * an empty queue from a broken filter, and three of these tabs are legitimately
 * empty most of the time.
 */
export const EMPTY_COPY: Record<BillStatusTab, string> = {
  draft: "No draft bills. A bill enters review as soon as it is created, so this is normally empty.",
  submitted: "Nothing awaiting a first review.",
  in_review: "Nothing in review.",
  approved: "Nothing approved and waiting to be completed.",
  declined: "Nothing declined.",
  completed: "No completed bills.",
};

export const NO_MATCH_COPY = "No bills match these filters.";


/**
 * `<input type="date">` can only display `YYYY-MM-DD`, and the API now types
 * these as `date` so anything else is a 422 (U-452, Codex P2). A shared or
 * hand-edited URL carrying `?from=01/01/2026` would otherwise apply an ACTIVE
 * filter that the control renders blank — invisible, and it breaks the request.
 * Ignore what we cannot both show and send.
 */
export function isIsoDate(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
