import { useQuery } from "@tanstack/react-query";
import { post } from "../../api/client";
import { EXPENSE_CODING_SUGGEST_KEY_PREFIX } from "../../persistPolicy";
import type { ExpenseCodingSuggestResponse } from "../../types/api";
import { expenseCodingSuggestPath } from "./expenseCodingSuggestion";

export function expenseCodingSuggestQueryKey(expensePublicId: string | undefined) {
  return [EXPENSE_CODING_SUGGEST_KEY_PREFIX, expensePublicId] as const;
}

/** Mirrors `can_update` on PUT `/api/v1/update/expense/{public_id}` (ExpenseEdit save path). */
export async function fetchExpenseCodingSuggest(
  expensePublicId: string,
): Promise<ExpenseCodingSuggestResponse | null> {
  try {
    return await post<ExpenseCodingSuggestResponse>(expenseCodingSuggestPath(expensePublicId), {});
  } catch (err) {
    console.error("Expense coding suggest failed", err);
    throw err;
  }
}

export interface UseExpenseCodingSuggestionParams {
  expensePublicId: string | undefined;
  /** Draft expense with lines loaded and at least one empty SCC or project cell. */
  enabled: boolean;
}

export function useExpenseCodingSuggestion({
  expensePublicId,
  enabled,
}: UseExpenseCodingSuggestionParams) {
  return useQuery({
    queryKey: expenseCodingSuggestQueryKey(expensePublicId),
    queryFn: () => fetchExpenseCodingSuggest(expensePublicId!),
    enabled: Boolean(expensePublicId && enabled),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
