import { useCallback, useEffect, useRef, useState } from "react";
import { getOne, ApiError } from "../api/client";

interface CompletionResult {
  status_code: number;
  message: string;
  [key: string]: unknown;
}

type PollingState =
  | { status: "idle" }
  | { status: "polling"; attempt: number }
  | { status: "complete"; result: CompletionResult }
  | { status: "error"; message: string };

/**
 * Poll a completion-result endpoint after triggering a 202 async operation.
 * Polls every 3s for up to 60 attempts (3 minutes).
 */
export function useCompletionPolling(resultPath: string) {
  const [state, setState] = useState<PollingState>({ status: "idle" });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptRef = useRef(0);
  const genRef = useRef(0); // bumped on every stop()/start(); a poll may mutate state only while its captured gen matches

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    genRef.current += 1; // invalidate any in-flight poll and any future tick from the current run
  }, []);

  const start = useCallback(() => {
    stop();
    const myGen = genRef.current; // this run's identity, captured AFTER stop()'s bump
    attemptRef.current = 0;
    setState({ status: "polling", attempt: 0 });

    timerRef.current = setInterval(async () => {
      if (genRef.current !== myGen) return; // superseded by a newer start()/stop(), or already settled
      attemptRef.current += 1;
      if (attemptRef.current > 60) {
        stop();
        setState({ status: "error", message: "Polling timed out after 3 minutes." });
        return;
      }
      setState({ status: "polling", attempt: attemptRef.current });
      try {
        const result = await getOne<CompletionResult>(resultPath);
        if (genRef.current !== myGen) return; // a concurrent poll settled, or the run was restarted, while we awaited
        stop();
        setState({ status: "complete", result });
      } catch (err) {
        if (genRef.current !== myGen) return;
        const status = err instanceof ApiError ? err.status : null;
        if (status === 404) {
          return;
        }
        if (status !== null) {
          stop();
          setState({
            status: "error",
            message:
              err instanceof ApiError && err.detail
                ? "Completion failed: " + err.detail
                : "Completion failed (status " + status + ").",
          });
          return;
        }
        // No HTTP status (OfflineError / network blip / unknown throw) — transient, keep polling
      }
    }, 3000);
  }, [resultPath, stop]);

  useEffect(() => stop, [stop]);

  return { state, start, stop };
}
