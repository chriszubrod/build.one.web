/**
 * Bills page status tabs (U-451).
 *
 * The canonical lifecycle vocabulary from U-357 §9a, filtered SERVER-SIDE via
 * `?status=` against the stored `Bill.Status` column (U-445). The tab list,
 * resolver and query builder are shared with Expenses — see
 * `../shared/statusTabs.ts` (U-752), which also carries the rationale for
 * there being no "All" tab and for filtering server-side.
 *
 * Extracted from BillList.tsx so the parts worth testing are testable without
 * mounting a component that also owns drag-and-drop uploads and folder polling.
 */
import { createStatusTabs, type DocumentStatusTab } from "../shared/statusTabs";

export type BillStatusTab = DocumentStatusTab;

/**
 * The default tab is `draft` (U-700): bills the user is still editing before
 * submit-for-review. An explicit `?status=` in the URL still wins via
 * `resolveStatusTab`.
 */
const billTabs = createStatusTabs({ defaultTab: "draft", listBasePath: "/bill/list" });

export const STATUS_TABS: { value: BillStatusTab; label: string }[] = billTabs.STATUS_TABS;
export const DEFAULT_STATUS_TAB: BillStatusTab = billTabs.DEFAULT_STATUS_TAB;
export const isStatusTab = billTabs.isStatusTab;
export const resolveStatusTab = billTabs.resolveStatusTab;
/** The query string appended to `/api/v1/get/bills` — always `?status=`. */
export const billListQuery = billTabs.listQuery;


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
  draft: "No draft bills.",
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
