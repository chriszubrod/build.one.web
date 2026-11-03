import type { Bill } from "../../types/api";
import { nextDraftPathFromList } from "../../shared/draftQueue";
import { billListQuery, type BillStatusTab } from "./billStatusTabs";

function billListPath(tab: BillStatusTab): string {
  return `/bill/list${billListQuery(tab)}`;
}

/** The Bills Draft tab — where a record returns to when it was not opened from a list (U-753). */
export const BILL_DRAFT_LIST_PATH = billListPath("draft");

/**
 * After submit-for-review on a bill, open the next draft on its edit page.
 * With no next draft, `fallbackPath` (the list the user came from — U-753),
 * defaulting to the Draft tab.
 */
export async function nextDraftPath(
  currentPublicId?: string,
  fallbackPath: string = BILL_DRAFT_LIST_PATH,
): Promise<string> {
  return nextDraftPathFromList<Bill>(
    {
      listPath: `/api/v1/get/bills${billListQuery("draft")}&page=1&page_size=2`,
      itemPath: (id) => `/bill/${id}/edit`,
      fallbackPath,
    },
    currentPublicId,
  );
}
