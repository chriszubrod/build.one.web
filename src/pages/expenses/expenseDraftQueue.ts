import type { Expense } from "../../types/api";
import { nextDraftPathFromList } from "../../shared/draftQueue";
import { expenseListPath, expenseListQuery } from "./expenseStatusTabs";

/**
 * After a draft is submitted from the View, open the next draft so a reviewer
 * can work a queue without returning to the list between items.
 */
export async function nextDraftPath(currentPublicId?: string): Promise<string> {
  return nextDraftPathFromList<Expense>(
    {
      listPath: `/api/v1/get/expenses${expenseListQuery("draft")}&page=1&page_size=2`,
      itemPath: (id) => `/expense/${id}`,
      fallbackPath: expenseListPath("draft"),
    },
    currentPublicId,
  );
}
