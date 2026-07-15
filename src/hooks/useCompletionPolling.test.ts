import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { getOne, ApiError, OfflineError } from "../api/client";
import { useCompletionPolling } from "./useCompletionPolling";
import { renderHook as renderHookHarness, deferred, drain } from "./__testutils__/renderHook";

vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, getOne: vi.fn() };
});

// Shape returned by the completion-result endpoint (mirrors the hook's CompletionResult).
type PollResult = { status_code: number; message: string };

const RESULT_PATH = "/api/v1/get/expense/1/completion-result";

// Render the polling hook through the shared createRoot/act harness.
function renderHook() {
  return renderHookHarness(() => useCompletionPolling(RESULT_PATH));
}

describe("useCompletionPolling", () => {
  beforeEach(() => {
    vi.mocked(getOne).mockReset();
  });

  it("404 keeps polling, then completes when ready", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getOne).mockRejectedValueOnce(new ApiError(404, "not found"));
      const h = renderHook();

      act(() => {
        h.result.current.start();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(h.result.current.state.status).toBe("polling");
      if (h.result.current.state.status === "polling") {
        expect(h.result.current.state.attempt).toBe(1);
      }

      vi.mocked(getOne).mockResolvedValueOnce({ status_code: 200, message: "ok" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(h.result.current.state.status).toBe("complete");
      if (h.result.current.state.status === "complete") {
        expect(h.result.current.state.result.message).toBe("ok");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("500 stops immediately with error", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getOne).mockRejectedValue(new ApiError(500, "Internal Server Error"));
      const h = renderHook();

      act(() => {
        h.result.current.start();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(h.result.current.state.status).toBe("error");
      if (h.result.current.state.status === "error") {
        expect(h.result.current.state.message).toContain("Internal Server Error");
      }

      const calls = vi.mocked(getOne).mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(vi.mocked(getOne).mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("401 stops immediately with error", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getOne).mockRejectedValue(new ApiError(401, "Unauthorized"));
      const h = renderHook();

      act(() => {
        h.result.current.start();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(h.result.current.state.status).toBe("error");

      const calls = vi.mocked(getOne).mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(vi.mocked(getOne).mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("200 completes on first poll", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getOne).mockResolvedValueOnce({ status_code: 200, message: "Done" });
      const h = renderHook();

      act(() => {
        h.result.current.start();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(h.result.current.state.status).toBe("complete");
      if (h.result.current.state.status === "complete") {
        expect(h.result.current.state.result.message).toBe("Done");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("transient network error keeps polling", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getOne).mockRejectedValue(new OfflineError());
      const h = renderHook();

      act(() => {
        h.result.current.start();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(h.result.current.state.status).toBe("polling");

      const callsAfterFirst = vi.mocked(getOne).mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(h.result.current.state.status).toBe("polling");
      expect(vi.mocked(getOne).mock.calls.length).toBeGreaterThan(callsAfterFirst);
    } finally {
      vi.useRealTimers();
    }
  });

  it("unmount stops the timer", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getOne).mockRejectedValue(new ApiError(404, "not found"));
      const h = renderHook();

      act(() => {
        h.result.current.start();
      });

      h.unmount();
      const calls = vi.mocked(getOne).mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9000);
      });
      expect(vi.mocked(getOne).mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a late fatal error does not overwrite a completed poll (overlap)", async () => {
    vi.useFakeTimers();
    try {
      const d1 = deferred<PollResult>();
      const d2 = deferred<PollResult>();
      vi.mocked(getOne)
        .mockImplementationOnce(() => d1.promise)
        .mockImplementationOnce(() => d2.promise);
      const h = renderHook();
      act(() => {
        h.result.current.start();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      }); // poll #1 -> awaits d1 (pending)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      }); // poll #2 -> awaits d2 (pending), overlap
      await act(async () => {
        d2.resolve({ status_code: 200, message: "ok" });
        await drain();
      }); // #2 completes
      expect(h.result.current.state.status).toBe("complete");
      await act(async () => {
        d1.reject(new ApiError(500, "Internal Server Error"));
        await drain();
      }); // #1 late 500
      expect(h.result.current.state.status).toBe("complete"); // NOT overwritten to error
    } finally {
      vi.useRealTimers();
    }
  });

  it("a late 200 does not overwrite a fatal error (overlap)", async () => {
    vi.useFakeTimers();
    try {
      const d1 = deferred<PollResult>();
      const d2 = deferred<PollResult>();
      vi.mocked(getOne)
        .mockImplementationOnce(() => d1.promise)
        .mockImplementationOnce(() => d2.promise);
      const h = renderHook();
      act(() => {
        h.result.current.start();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      }); // poll #1 -> d1
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      }); // poll #2 -> d2, overlap
      await act(async () => {
        d1.reject(new ApiError(500, "Internal Server Error"));
        await drain();
      }); // #1 errors first
      expect(h.result.current.state.status).toBe("error");
      await act(async () => {
        d2.resolve({ status_code: 200, message: "ok" });
        await drain();
      }); // #2 late 200
      expect(h.result.current.state.status).toBe("error"); // NOT overwritten to complete
    } finally {
      vi.useRealTimers();
    }
  });

  it("a stale poll from a previous start() does not clobber a fresh run", async () => {
    vi.useFakeTimers();
    try {
      const d1 = deferred<PollResult>();
      const d2 = deferred<PollResult>();
      vi.mocked(getOne)
        .mockImplementationOnce(() => d1.promise)
        .mockImplementationOnce(() => d2.promise);
      const h = renderHook();
      act(() => {
        h.result.current.start();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      }); // run A poll -> getOne#1 (d1, pending)
      act(() => {
        h.result.current.start();
      }); // RESTART -> new generation, old interval cleared
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      }); // run B poll -> getOne#2 (d2, pending)
      await act(async () => {
        d1.resolve({ status_code: 200, message: "STALE" });
        await drain();
      }); // stale run-A result
      expect(h.result.current.state.status).toBe("polling"); // NOT clobbered to complete by the stale poll
      await act(async () => {
        d2.resolve({ status_code: 200, message: "FRESH" });
        await drain();
      });
      expect(h.result.current.state.status).toBe("complete");
      if (h.result.current.state.status === "complete") {
        expect(h.result.current.state.result.message).toBe("FRESH");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops with a timeout error after the 60-attempt cap", async () => {
    vi.useFakeTimers();
    try {
      // Endpoint never becomes ready — every poll 404s, so the run reaches the cap.
      vi.mocked(getOne).mockRejectedValue(new ApiError(404, "not found"));
      const h = renderHook();
      act(() => {
        h.result.current.start();
      });
      // Attempts 1..60 stay polling; attempt 61 trips the cap and stops.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000 * 61);
      });
      expect(h.result.current.state.status).toBe("error");
      if (h.result.current.state.status === "error") {
        expect(h.result.current.state.message).toContain("timed out");
      }
      // Timer is stopped — no further polls after the cap.
      const calls = vi.mocked(getOne).mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9000);
      });
      expect(vi.mocked(getOne).mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });
});
