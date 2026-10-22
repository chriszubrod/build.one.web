import { getList } from "../../api/client";
import type { Expense } from "../../types/api";
import { expenseListPath, expenseListQuery } from "./expenseStatusTabs";

/**
 * After a draft is submitted from the View, open the next draft so a reviewer
 * can work a queue without returning to the list between items.
 */
export async function nextDraftPath(currentPublicId?: string): Promise<string> {
  try {
    const res = await getList<Expense>(
      `/api/v1/get/expenses${expenseListQuery("draft")}&page=1&page_size=2`,
    );
    const next = res.data.find((e) => e.public_id !== currentPublicId);
    if (next) return `/expense/${next.public_id}`;
  } catch {
    // Fall through — the Draft tab is the right place either way.
  }
  return expenseListPath("draft");
}
