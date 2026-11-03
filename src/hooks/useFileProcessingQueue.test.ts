import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { useFileProcessingQueue, type FileProcessingQueueOptions } from "./useFileProcessingQueue";
import { deferred, drain, renderHook, type Deferred } from "./__testutils__/renderHook";

interface Row {
  id: string;
  status: "pending" | "working" | "done" | "error";
  note?: string;
}

function row(id: string): Row {
  return { id, status: "pending" };
}

/**
 * A queue whose `process` parks every row on a hand-settled deferred, so a
 * spec can observe exactly which rows are in flight at each step.
 */
function setup(extra: Partial<FileProcessingQueueOptions<Row>> = {}) {
  const gates = new Map<string, Deferred>();
  const started: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const onSettled = vi.fn();
  const process = vi.fn(async (r: Row, patch: (p: Partial<Row>) => void) => {
    started.push(r.id);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    patch({ status: "working" });
    const gate = deferred();
    gates.set(r.id, gate);
    try {
      await gate.promise;
      patch({ status: "done" });
    } catch {
      patch({ status: "error", note: "failed" });
    } finally {
      inFlight -= 1;
    }
  });
  const hook = renderHook(() =>
    useFileProcessingQueue<Row>({
      isPending: (r) => r.status === "pending",
      process,
      onSettled,
      ...extra,
    }),
  );
  const settle = async (id: string, ok = true) => {
    const gate = gates.get(id);
    expect(gate, `row ${id} was never started`).toBeDefined();
    await act(async () => {
      if (ok) gate!.resolve();
      else gate!.reject(new Error("boom"));
      await drain();
    });
  };
  const statuses = () => hook.result.current.rows.map((r) => `${r.id}:${r.status}`);
  return { hook, process, onSettled, started, settle, statuses, maxInFlight: () => maxInFlight };
}

describe("useFileProcessingQueue", () => {
  it("processes rows one at a time, in enqueue order", async () => {
    const q = setup();
    await act(async () => {
      q.hook.result.current.enqueue([row("a"), row("b"), row("c")]);
      await drain();
    });
    expect(q.started).toEqual(["a"]);
    expect(q.statuses()).toEqual(["a:working", "b:pending", "c:pending"]);

    await q.settle("a");
    expect(q.started).toEqual(["a", "b"]);
    expect(q.statuses()).toEqual(["a:done", "b:working", "c:pending"]);

    await q.settle("b", false);
    await q.settle("c");
    expect(q.started).toEqual(["a", "b", "c"]);
    expect(q.statuses()).toEqual(["a:done", "b:error", "c:done"]);
    expect(q.hook.result.current.rows[1].note).toBe("failed");
    expect(q.maxInFlight()).toBe(1);
  });

  it("is single-flight: enqueue during processing does not start a second loop", async () => {
    const q = setup();
    await act(async () => {
      q.hook.result.current.enqueue([row("a")]);
      await drain();
    });
    await act(async () => {
      q.hook.result.current.enqueue([row("b")]);
      q.hook.result.current.enqueue([row("c")]);
      await drain();
    });
    // Still only "a" in flight — "b"/"c" wait for it.
    expect(q.started).toEqual(["a"]);
    expect(q.process).toHaveBeenCalledTimes(1);

    await q.settle("a");
    await q.settle("b");
    await q.settle("c");
    expect(q.started).toEqual(["a", "b", "c"]);
    expect(q.process).toHaveBeenCalledTimes(3);
    expect(q.maxInFlight()).toBe(1);
  });

  it("processes rows enqueued from onSettled (after the loop went idle)", async () => {
    let added = false;
    const q = setup({
      onSettled: () => {
        if (added) return;
        added = true;
        q.hook.result.current.enqueue([row("late")]);
      },
    });
    await act(async () => {
      q.hook.result.current.enqueue([row("a")]);
      await drain();
    });
    await q.settle("a");
    expect(added).toBe(true);
    expect(q.started).toEqual(["a", "late"]);
    await q.settle("late");
    expect(q.statuses()).toEqual(["a:done", "late:done"]);
  });

  it("calls onSettled each time the loop goes idle, not per row", async () => {
    const q = setup();
    await act(async () => {
      q.hook.result.current.enqueue([row("a"), row("b")]);
      await drain();
    });
    await q.settle("a");
    expect(q.onSettled).not.toHaveBeenCalled();
    await q.settle("b");
    expect(q.onSettled).toHaveBeenCalledTimes(1);

    await act(async () => {
      q.hook.result.current.enqueue([row("c")]);
      await drain();
    });
    await q.settle("c");
    expect(q.onSettled).toHaveBeenCalledTimes(2);
  });

  it("enqueue of an empty list is a no-op", async () => {
    const q = setup();
    await act(async () => {
      q.hook.result.current.enqueue([]);
      await drain();
    });
    expect(q.hook.result.current.rows).toEqual([]);
    expect(q.process).not.toHaveBeenCalled();
    expect(q.onSettled).not.toHaveBeenCalled();
  });

  it("patchRow merges by id and keeps the ref mirror current before a re-render", async () => {
    const q = setup();
    await act(async () => {
      q.hook.result.current.enqueue([row("a"), row("b")]);
      await drain();
    });
    const { patchRow, rowsRef } = q.hook.result.current;
    act(() => {
      patchRow("b", { note: "hello" });
      // Synchronous mirror — readable inside the same handler.
      expect(rowsRef.current.find((r) => r.id === "b")?.note).toBe("hello");
    });
    expect(q.hook.result.current.rows.find((r) => r.id === "b")?.note).toBe("hello");
    expect(q.hook.result.current.rows.find((r) => r.id === "a")?.note).toBeUndefined();
  });

  it("remove drops one row; a removed pending row is never processed", async () => {
    const q = setup();
    await act(async () => {
      q.hook.result.current.enqueue([row("a"), row("b"), row("c")]);
      await drain();
    });
    act(() => q.hook.result.current.remove("b"));
    expect(q.statuses()).toEqual(["a:working", "c:pending"]);
    await q.settle("a");
    await q.settle("c");
    expect(q.started).toEqual(["a", "c"]);
  });

  it("a patch for a row removed mid-flight is a no-op", async () => {
    const q = setup();
    await act(async () => {
      q.hook.result.current.enqueue([row("a"), row("b")]);
      await drain();
    });
    act(() => q.hook.result.current.remove("a"));
    await q.settle("a");
    expect(q.statuses()).toEqual(["b:working"]);
  });

  it("clear empties the queue; later enqueues still process", async () => {
    const q = setup();
    await act(async () => {
      q.hook.result.current.enqueue([row("a"), row("b")]);
      await drain();
    });
    act(() => q.hook.result.current.clear());
    expect(q.hook.result.current.rows).toEqual([]);
    expect(q.hook.result.current.rowsRef.current).toEqual([]);
    await q.settle("a");
    // "b" was cleared before it started.
    expect(q.started).toEqual(["a"]);
    await act(async () => {
      q.hook.result.current.enqueue([row("d")]);
      await drain();
    });
    expect(q.started).toEqual(["a", "d"]);
  });

  it("never hands the same row to process twice, even if it is reverted to pending", async () => {
    const q = setup();
    await act(async () => {
      q.hook.result.current.enqueue([row("a")]);
      await drain();
    });
    await q.settle("a");
    expect(q.statuses()).toEqual(["a:done"]);
    // Revert "a" to pending, then kick the loop with a new row.
    act(() => q.hook.result.current.patchRow("a", { status: "pending" }));
    await act(async () => {
      q.hook.result.current.enqueue([row("b")]);
      await drain();
    });
    expect(q.started).toEqual(["a", "b"]);
    await q.settle("b");
    expect(q.process).toHaveBeenCalledTimes(2);
    expect(q.statuses()).toEqual(["a:pending", "b:done"]);
  });

  it("onError moves a row whose process step threw out of pending", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const onError = vi.fn((_r: Row, err: unknown, patch: (p: Partial<Row>) => void) =>
        patch({ status: "error", note: (err as Error).message }),
      );
      const hook = renderHook(() =>
        useFileProcessingQueue<Row>({
          isPending: (r) => r.status === "pending",
          process: async (r, patch) => {
            if (r.id === "a") throw new Error("escaped");
            patch({ status: "done" });
          },
          onError,
        }),
      );
      await act(async () => {
        hook.result.current.enqueue([row("a"), row("b")]);
        await drain();
      });
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].id).toBe("a");
      expect(hook.result.current.rows.map((r) => `${r.id}:${r.status}`)).toEqual(["a:error", "b:done"]);
      expect(hook.result.current.rows[0].note).toBe("escaped");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("a process step that throws does not stall the queue", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const seen: string[] = [];
      const hook = renderHook(() =>
        useFileProcessingQueue<Row>({
          isPending: (r) => r.status === "pending",
          process: async (r, patch) => {
            seen.push(r.id);
            if (r.id === "a") throw new Error("escaped");
            patch({ status: "done" });
          },
        }),
      );
      await act(async () => {
        hook.result.current.enqueue([row("a"), row("b")]);
        await drain();
      });
      expect(seen).toEqual(["a", "b"]);
      expect(hook.result.current.rows.map((r) => `${r.id}:${r.status}`)).toEqual([
        "a:pending",
        "b:done",
      ]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
