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
