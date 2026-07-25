import { act } from "react";
import { vi } from "vitest";

/**
 * Flush until `check()` passes, ADVANCING FAKE TIMERS each iteration.
 *
 * PRECONDITION: the caller must be on fake timers (`vi.useFakeTimers()`).
 *
 * Microtask-only flushing (`await Promise.resolve()` xN) is NOT enough when a
 * spec needs a React Query refetch to reach the component: under fake timers
 * the observer notification needs a timer tick before React re-renders, so a
 * microtask-only spec asserts against the stale render. That is precisely how
 * the `formSeedId` clobber specs shipped false-green four times (U-152).
 *
 * Returns silently if `check()` never passes — always follow it with a hard
 * assertion on the same condition, so an exhausted flush fails loudly.
 */
export async function flushUntil(check: () => boolean): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 50; i++) {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      if (check()) return;
    }
  });
}
