import { useEffect, useRef, useState } from "react";
import {
  applySuggestionToLines,
  billLevelBudgetChip,
  buildCodingSuggestInputKey,
  codingSuggestAmountFromLines,
  projectHintFromLines,
  serializeCodingSuggestKey,
  suggestedSccOptionIdFromResponse,
  suggestCoding,
  type BillCodingBudgetSnapshot,
  type LineCodingFields,
  type SccCatalogEntry,
} from "./codingSuggestion";

export interface UseBillCodingSuggestionParams<
  T extends LineCodingFields & { amount?: string | null },
> {
  enabled: boolean;
  vendor_public_id: string;
  memo: string;
  debouncedMemo: string;
  /** Debounced counterpart of {@link codingSuggestAmountFromLines} — parent owns the timer. */
  debouncedAmount: string | undefined;
  projectHintForSuggest: string | undefined;
  lines: T[];
  sccCatalog: SccCatalogEntry[];
  bill_public_id?: string;
  setLines: (updater: (prev: T[]) => T[]) => void;
}

export function useBillCodingSuggestion<
  T extends LineCodingFields & { amount?: string | null },
>({
  enabled,
  vendor_public_id,
  memo,
  debouncedMemo,
  debouncedAmount,
  projectHintForSuggest,
  lines,
  sccCatalog,
  bill_public_id,
  setLines,
}: UseBillCodingSuggestionParams<T>) {
  const [budgetSnapshot, setBudgetSnapshot] = useState<BillCodingBudgetSnapshot | null>(null);
  const lastFiredRequestKeyRef = useRef<string | null>(null);
  const inFlightRequestKeyRef = useRef<string | null>(null);
  const prevImmediateRef = useRef({ vendor: "", project: "" });
  const sccCatalogRef = useRef(sccCatalog);
  sccCatalogRef.current = sccCatalog;

  const projectHint = projectHintForSuggest ?? projectHintFromLines(lines);
  const memoSettled = memo === debouncedMemo;
  const amount = codingSuggestAmountFromLines(lines, projectHint);
  const amountSettled = (amount ?? "") === (debouncedAmount ?? "");

  // The inputs on screen right now (raw memo, live amount). A response is applied
  // only if these still equal the inputs it was asked for — checked when it
  // ARRIVES, so no effect cleanup has to remember to cancel it (U-655a r7).
  const liveInputKey =
    enabled && vendor_public_id
      ? serializeCodingSuggestKey(
          buildCodingSuggestInputKey({
            vendor_public_id,
            memo,
            project_public_id: projectHint,
            amount,
          }),
        )
      : null;

  const currentKey = memoSettled && amountSettled ? liveInputKey : null;
  const liveInputKeyRef = useRef<string | null>(null);
  liveInputKeyRef.current = liveInputKey;

  useEffect(() => {
    if (!enabled || !vendor_public_id || !memoSettled) return;
    // Wait for the SCC catalog: a suggestion mapped against an empty catalog fills nothing.
    if (sccCatalog.length === 0) return;

    const immediateChanged =
      prevImmediateRef.current.vendor !== vendor_public_id ||
      prevImmediateRef.current.project !== (projectHint ?? "");
    prevImmediateRef.current = {
      vendor: vendor_public_id,
      project: projectHint ?? "",
    };

    if (!immediateChanged && !amountSettled) return;

    const requestKey = liveInputKey;
    if (requestKey == null) return;

    if (inFlightRequestKeyRef.current === requestKey) return;
    if (requestKey === lastFiredRequestKeyRef.current) return;

    lastFiredRequestKeyRef.current = requestKey;
    inFlightRequestKeyRef.current = requestKey;

    void (async () => {
      try {
        const suggestion = await suggestCoding({
          vendor_public_id,
          project_public_id: projectHint,
          memo: debouncedMemo,
          bill_public_id,
          ...(amount != null ? { amount } : {}),
        });
        // Ordering note: two requests for the SAME key cannot both land here because
        // suggestCoding aborts the previous request (a superseded one resolves null
        // while the live key differs). Keep that abort if suggestCoding changes.
        if (liveInputKeyRef.current !== requestKey) {
          // Inputs moved on while this was in flight: drop it, and let these same
          // inputs be asked again if the screen returns to them.
          if (lastFiredRequestKeyRef.current === requestKey) lastFiredRequestKeyRef.current = null;
          return;
        }

        const catalog = sccCatalogRef.current;
        setLines((prev) => applySuggestionToLines(prev, suggestion, catalog));

        const check = suggestion?.budget_check;
        const responseProject = suggestion?.project_public_id ?? "";
        const projectMismatch =
          projectHint != null &&
          responseProject !== "" &&
          responseProject !== projectHint;
        const suggestedSccOptionId = suggestedSccOptionIdFromResponse(suggestion, catalog);
        if (
          !projectMismatch &&
          (check === "fits" ||
            check === "tight" ||
            check === "over" ||
            check === "unbudgeted" ||
            check === "no_budget")
        ) {
          setBudgetSnapshot({
            key: requestKey,
            budget_check: check,
            budget_remaining: suggestion?.budget_remaining ?? null,
            project_public_id: projectHint ?? "",
            suggested_scc_option_id: suggestedSccOptionId,
          });
        } else {
          setBudgetSnapshot(null);
        }
      } finally {
        if (inFlightRequestKeyRef.current === requestKey) {
          inFlightRequestKeyRef.current = null;
        }
      }
    })();
  }, [
    enabled,
    vendor_public_id,
    debouncedMemo,
    memoSettled,
    amountSettled,
    projectHint,
    amount,
    debouncedAmount,
    bill_public_id,
    sccCatalog.length,
    setLines,
  ]);

  const budgetChip = billLevelBudgetChip(
    budgetSnapshot,
    currentKey,
    projectHint,
    amount,
    lines,
  );

  return { budgetChip };
}
