import { useCallback, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";

/**
 * A sequential upload-and-process queue for dropped files (U-753).
 *
 * Extracted from the two hand-rolled copies on BillList (PDF → draft bill) and
 * the expense receipt matcher (receipt → read-receipt candidates). The hook
 * owns the rows, a synchronous ref mirror of them (so the processing loop and
 * event handlers never read a stale render), single-flight sequential
 * processing, and the re-kick when rows were enqueued while the loop was
 * winding down. Each page supplies its own per-row `process` step and keeps
 * its own row shape, statuses and copy.
 */

export interface FileProcessingQueueOptions<Row extends { id: string }> {
  /** True for a row that is waiting to be processed. */
  isPending: (row: Row) => boolean;
  /**
   * Process one row. `patch` merges into that row (by id) and is a no-op once
   * the row was removed or cleared. Rows are processed one at a time, in
   * enqueue order. `process` owns its failure UI (patch the row to an error
   * state); an exception that still escapes is logged, handed to `onError`,
   * and the queue moves on to the next row rather than stalling.
   */
  process: (row: Row, patch: (patch: Partial<Row>) => void) => Promise<void>;
  /** Runs every time the loop goes idle (after the last pending row). */
  onSettled?: () => void;
  /**
   * Called when `process` throws instead of handling its own failure, so the
   * row can be moved out of its in-flight state (otherwise it would show
   * Uploading…/Queued forever). `row` is the row's CURRENT value (skipped if
   * it was removed meanwhile); `patch` merges into it.
   */
  onError?: (row: Row, err: unknown, patch: (patch: Partial<Row>) => void) => void;
}

export interface FileProcessingQueue<Row extends { id: string }> {
  rows: Row[];
  /** Synchronous mirror of `rows` — current even before React re-renders. */
  rowsRef: MutableRefObject<Row[]>;
  patchRow: (id: string, patch: Partial<Row>) => void;
  /** Append rows and start processing if the loop is idle. Empty input is a no-op. */
  enqueue: (rows: Row[]) => void;
  remove: (id: string) => void;
  /** Drop every row and forget which rows were started. */
  clear: () => void;
}

export function useFileProcessingQueue<Row extends { id: string }>(
  options: FileProcessingQueueOptions<Row>,
): FileProcessingQueue<Row> {
  const [rows, setRows] = useState<Row[]>([]);
  const rowsRef = useRef<Row[]>(rows);
  const processingRef = useRef(false);
  // A row is handed to `process` at most once, even if something reverts it
  // to pending — the loop and its re-kick both skip started rows.
  const startedIdsRef = useRef(new Set<string>());
  // Latest options, read by the loop at each step (the loop outlives renders).
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const commit = useCallback((next: Row[]) => {
    rowsRef.current = next;
    setRows(next);
  }, []);

  const patchRow = useCallback(
    (id: string, patch: Partial<Row>) => {
      commit(rowsRef.current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [commit],
  );

  const nextPending = useCallback(
    () =>
      rowsRef.current.find(
        (r) => optionsRef.current.isPending(r) && !startedIdsRef.current.has(r.id),
      ),
    [],
  );

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      for (;;) {
        const entry = nextPending();
        if (!entry) break;
        startedIdsRef.current.add(entry.id);
        try {
          await optionsRef.current.process(entry, (patch) => patchRow(entry.id, patch));
        } catch (err) {
          console.error("useFileProcessingQueue: process step threw", err);
          // The row as it is NOW (it may have been patched or removed mid-step).
          const current = rowsRef.current.find((r) => r.id === entry.id);
          if (current) {
            optionsRef.current.onError?.(current, err, (patch) => patchRow(entry.id, patch));
          }
        }
      }
    } finally {
      processingRef.current = false;
      optionsRef.current.onSettled?.();
      if (nextPending()) {
        void processQueue();
      }
    }
  }, [nextPending, patchRow]);

  const enqueue = useCallback(
    (newRows: Row[]) => {
      if (newRows.length === 0) return;
      commit([...rowsRef.current, ...newRows]);
      void processQueue();
    },
    [commit, processQueue],
  );

  const remove = useCallback(
    (id: string) => {
      commit(rowsRef.current.filter((r) => r.id !== id));
    },
    [commit],
  );

  const clear = useCallback(() => {
    commit([]);
    startedIdsRef.current.clear();
  }, [commit]);

  return { rows, rowsRef, patchRow, enqueue, remove, clear };
}
