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
  type BillCodingSuggestion,
  type LineCodingFields,
  type SccCatalogEntry,
} from "./codingSuggestion";

const TEXT_POLL_INTERVAL_MS = 20_000;
const TEXT_POLL_MAX_ATTEMPTS = 6;

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
  /** BillEdit drafts only: poll while API returns text_status pending. */
  textSuggestionPoll?: boolean;
  /** Parent increments when the user edits a line — stops text polling. */
  lineUserEditEpoch?: number;
}

function applySuggestionResponse<T extends LineCodingFields & { amount?: string | null }>(
  requestKey: string,
  projectHint: string | undefined,
  suggestion: BillCodingSuggestion | null,
  catalog: SccCatalogEntry[],
  setLines: (updater: (prev: T[]) => T[]) => void,
  setBudgetSnapshot: (v: BillCodingBudgetSnapshot | null) => void,
): void {
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
  textSuggestionPoll = false,
  lineUserEditEpoch = 0,
}: UseBillCodingSuggestionParams<T>) {
  const [budgetSnapshot, setBudgetSnapshot] = useState<BillCodingBudgetSnapshot | null>(null);
  const lastFiredRequestKeyRef = useRef<string | null>(null);
  const inFlightRequestKeyRef = useRef<string | null>(null);
  const prevImmediateRef = useRef({ vendor: "", project: "" });
  const sccCatalogRef = useRef(sccCatalog);
  sccCatalogRef.current = sccCatalog;

  const [textPollSession, setTextPollSession] = useState<{
    requestKey: string;
    editEpochAtStart: number;
  } | null>(null);
  const textPollAttemptsRef = useRef(0);
  const pollInFlightRef = useRef(false);
  const lineUserEditEpochRef = useRef(lineUserEditEpoch);
  lineUserEditEpochRef.current = lineUserEditEpoch;

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

  const suggestParamsRef = useRef({
    vendor_public_id,
    debouncedMemo,
    projectHint,
    amount,
    bill_public_id,
  });
  suggestParamsRef.current = {
    vendor_public_id,
    debouncedMemo,
    projectHint,
    amount,
    bill_public_id,
  };

  const requestSuggestion = () => {
    const p = suggestParamsRef.current;
    return {
      projectHint: p.projectHint,
      response: suggestCoding({
        vendor_public_id: p.vendor_public_id,
        project_public_id: p.projectHint,
        memo: p.debouncedMemo,
        bill_public_id: p.bill_public_id,
        ...(p.amount != null ? { amount: p.amount } : {}),
      }),
    };
  };
  const requestSuggestionRef = useRef(requestSuggestion);
  requestSuggestionRef.current = requestSuggestion;

  /** A poll session ends once the user edits a line or the inputs move off its key. */
  const pollSessionIsLive = (session: { requestKey: string; editEpochAtStart: number }) =>
    lineUserEditEpochRef.current === session.editEpochAtStart &&
    liveInputKeyRef.current === session.requestKey;
  const pollSessionIsLiveRef = useRef(pollSessionIsLive);
  pollSessionIsLiveRef.current = pollSessionIsLive;

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
        const { projectHint: requestProjectHint, response } = requestSuggestionRef.current();
        const suggestion = await response;
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
        applySuggestionResponse(
          requestKey,
          requestProjectHint,
          suggestion,
          catalog,
          setLines,
          setBudgetSnapshot,
        );

        if (
          textSuggestionPoll &&
          suggestion?.text_status === "pending"
        ) {
          textPollAttemptsRef.current = 0;
          setTextPollSession({
            requestKey,
            editEpochAtStart: lineUserEditEpochRef.current,
          });
        } else {
          setTextPollSession(null);
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
    textSuggestionPoll,
  ]);

  // Stop polling as soon as the user edits a line or inputs move off the polled key.
  useEffect(() => {
    if (textPollSession != null && !pollSessionIsLiveRef.current(textPollSession)) {
      setTextPollSession(null);
    }
  }, [textPollSession, lineUserEditEpoch, liveInputKey]);

  useEffect(() => {
    if (textPollSession == null || !textSuggestionPoll) return;

    const session = textPollSession;

    const id = window.setInterval(() => {
      // One poll at a time: a slow response must not be overtaken by the next tick.
      if (pollInFlightRef.current) return;
      if (!pollSessionIsLiveRef.current(session)) {
        setTextPollSession(null);
        return;
      }
      textPollAttemptsRef.current += 1;
      if (textPollAttemptsRef.current > TEXT_POLL_MAX_ATTEMPTS) {
        setTextPollSession(null);
        return;
      }

      pollInFlightRef.current = true;
      void (async () => {
        try {
          const { projectHint: requestProjectHint, response } = requestSuggestionRef.current();
          const suggestion = await response;
          // null = aborted or failed: keep what is on screen and try again next tick.
          if (suggestion == null) return;
          if (!pollSessionIsLiveRef.current(session)) {
            setTextPollSession(null);
            return;
          }
          applySuggestionResponse(
            session.requestKey,
            requestProjectHint,
            suggestion,
            sccCatalogRef.current,
            setLines,
            setBudgetSnapshot,
          );
          if (suggestion.text_status !== "pending") setTextPollSession(null);
        } finally {
          pollInFlightRef.current = false;
        }
      })();
    }, TEXT_POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [textPollSession, textSuggestionPoll, setLines]);

  const budgetChip = billLevelBudgetChip(
    budgetSnapshot,
    currentKey,
    projectHint,
    amount,
    lines,
  );

  return { budgetChip };
}
