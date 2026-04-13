import { useCallback, useEffect, useRef, useState } from "react";
import { getOne } from "../api/client";

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

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    stop();
    attemptRef.current = 0;
    setState({ status: "polling", attempt: 0 });

    timerRef.current = setInterval(async () => {
      attemptRef.current += 1;
      if (attemptRef.current > 60) {
        stop();
        setState({ status: "error", message: "Polling timed out after 3 minutes." });
        return;
      }
      setState({ status: "polling", attempt: attemptRef.current });
      try {
        const result = await getOne<CompletionResult>(resultPath);
        stop();
        setState({ status: "complete", result });
      } catch {
        // 404 means result not ready yet — keep polling
      }
    }, 3000);
  }, [resultPath, stop]);

  useEffect(() => stop, [stop]);

  return { state, start, stop };
}
