import { useCallback, useEffect, useRef, useState } from "react";
import { getOne, ApiError } from "../api/client";

interface CompletionResult {
  status_code: number;
  message: string;
  [key: string]: unknown;
}

export type PollingState<T> =
  | { status: "idle" }
  | { status: "polling"; attempt: number }
  | { status: "complete"; result: T }
  | { status: "error"; message: string };

export interface CompletionPollingOptions<T> {
  isDone?: (result: T) => boolean;
  onComplete?: (result: T) => void;
  onError?: (message: string) => void;
}

/**
 * Poll a completion-result endpoint after triggering a 202 async operation.
 * Polls every 3s for up to 60 attempts (3 minutes).
 */
export function useCompletionPolling<T = CompletionResult>(
  resultPath: string,
  opts?: CompletionPollingOptions<T>,
) {
  const [state, setState] = useState<PollingState<T>>({ status: "idle" });
  const optsRef = useRef(opts);
  optsRef.current = opts;
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
        const message = "Polling timed out after 3 minutes.";
        setState({ status: "error", message });
        optsRef.current?.onError?.(message);
        return;
      }
      setState({ status: "polling", attempt: attemptRef.current });
      try {
        const result = await getOne<T>(resultPath);
        if (genRef.current !== myGen) return; // a concurrent poll settled, or the run was restarted, while we awaited
        if (optsRef.current?.isDone && !optsRef.current.isDone(result)) {
          return; // not done yet — keep polling (attempt counter continues)
        }
        stop();
        setState({ status: "complete", result });
        optsRef.current?.onComplete?.(result);
      } catch (err) {
        if (genRef.current !== myGen) return;
        const status = err instanceof ApiError ? err.status : null;
        if (status === 404) {
          return;
        }
        if (status !== null) {
          stop();
          const message =
            err instanceof ApiError && err.detail
              ? "Completion failed: " + err.detail
              : "Completion failed (status " + status + ").";
          setState({ status: "error", message });
          optsRef.current?.onError?.(message);
          return;
        }
        // No HTTP status (OfflineError / network blip / unknown throw) — transient, keep polling
      }
    }, 3000);
  }, [resultPath, stop]);

  useEffect(() => stop, [stop]);

  return { state, start, stop };
}
