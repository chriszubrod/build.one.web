import type { Expense } from "../../types/api";
import { nextDraftPathFromList } from "../../shared/draftQueue";
import { expenseListPath, expenseListQuery } from "./expenseStatusTabs";

/** The Expenses Draft tab — the default return target for a record (U-753). */
export const EXPENSE_DRAFT_LIST_PATH = expenseListPath("draft");

/**
 * After a draft is submitted from the View, open the next draft so a reviewer
 * can work a queue without returning to the list between items. With no next
 * draft, `fallbackPath` (the list the user came from — U-753), defaulting to
 * the Draft tab.
 */
export async function nextDraftPath(
  currentPublicId?: string,
  fallbackPath: string = EXPENSE_DRAFT_LIST_PATH,
): Promise<string> {
  return nextDraftPathFromList<Expense>(
    {
      listPath: `/api/v1/get/expenses${expenseListQuery("draft")}&page=1&page_size=2`,
      itemPath: (id) => `/expense/${id}`,
      fallbackPath,
    },
    currentPublicId,
  );
}
