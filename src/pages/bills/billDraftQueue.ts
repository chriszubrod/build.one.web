import type { Bill } from "../../types/api";
import { nextDraftPathFromList } from "../../shared/draftQueue";
import { billListQuery, type BillStatusTab } from "./billStatusTabs";

function billListPath(tab: BillStatusTab): string {
  return `/bill/list${billListQuery(tab)}`;
}

/** After submit-for-review on a bill, open the next draft on its edit page. */
export async function nextDraftPath(currentPublicId?: string): Promise<string> {
  return nextDraftPathFromList<Bill>(
    {
      listPath: `/api/v1/get/bills${billListQuery("draft")}&page=1&page_size=2`,
      itemPath: (id) => `/bill/${id}/edit`,
      fallbackPath: billListPath("draft"),
    },
    currentPublicId,
  );
}
