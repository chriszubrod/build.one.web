/**
 * Shared lifecycle status tabs for document list pages (Bills, Expenses).
 *
 * The canonical lifecycle vocabulary from U-357 §9a, filtered SERVER-SIDE via
 * `?status=` against the stored `Status` column (Bill U-445, Expense U-467).
 * Filtering in SQL is what keeps `count` honest — post-filtering an
 * already-paginated page would make the results chip describe a different set
 * than the rows (U-447).
 *
 * There is deliberately no "All" tab (Chris, 2026-09-11). Before U-451 the
 * Bills page defaulted to `?is_draft=true`, which showed every in-flight bill
 * in one view; U-451 split that across Submitted / In Review / Declined / etc.
 * Re-adding one is a product decision, not a tidy-up.
 *
 * U-752 extracted this from the near-identical `billStatusTabs.ts` and
 * `expenseStatusTabs.ts`, which are now thin wrappers keeping their exported
 * names.
 */

export type DocumentStatusTab =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "declined"
  | "completed";

export const DOCUMENT_STATUS_TABS: readonly { value: DocumentStatusTab; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "completed", label: "Completed" },
];

export interface StatusTabsConfig {
  /** The tab a missing or junk `?status=` resolves to. */
  defaultTab: DocumentStatusTab;
  /** The list page route, e.g. `/expense/list` — used by `listPath`. */
  listBasePath: string;
}

export interface StatusTabs {
  STATUS_TABS: { value: DocumentStatusTab; label: string }[];
  DEFAULT_STATUS_TAB: DocumentStatusTab;
  isStatusTab: (value: string | null | undefined) => value is DocumentStatusTab;
  /** The tab a `?status=` URL param selects — falling back rather than 404-ing on junk. */
  resolveStatusTab: (param: string | null | undefined) => DocumentStatusTab;
  /**
   * The query string appended to the list API (`/api/v1/get/<entity>`).
   *
   * Always `?status=`, never `?is_draft=`: the old parameter could express only
   * two of the six states, so Submitted, In Review and Declined were all
   * indistinguishably "draft". The API rejects an unknown status with a 422
   * rather than silently returning everything, which is why `resolveStatusTab`
   * normalises before we get here.
   */
  listQuery: (tab: DocumentStatusTab) => string;
  /**
   * The list URL that lands on the tab holding a document of this status, so a
   * breadcrumb back from a draft lands on Draft. Unknown statuses fall back to
   * the default tab exactly like the URL param does.
   */
  listPath: (status: string | null | undefined) => string;
}

export function createStatusTabs({ defaultTab, listBasePath }: StatusTabsConfig): StatusTabs {
  const STATUS_TABS = DOCUMENT_STATUS_TABS.map((t) => ({ ...t }));
  const isStatusTab = (value: string | null | undefined): value is DocumentStatusTab =>
    STATUS_TABS.some((o) => o.value === value);
  const resolveStatusTab = (param: string | null | undefined): DocumentStatusTab =>
    isStatusTab(param) ? param : defaultTab;
  return {
    STATUS_TABS,
    DEFAULT_STATUS_TAB: defaultTab,
    isStatusTab,
    resolveStatusTab,
    listQuery: (tab) => `?status=${tab}`,
    listPath: (status) => `${listBasePath}?status=${resolveStatusTab(status)}`,
  };
}
