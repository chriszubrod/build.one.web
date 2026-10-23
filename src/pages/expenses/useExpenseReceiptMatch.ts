import { useCallback, useRef, useState } from "react";
import { uploadFile, post, ApiError, OfflineError } from "../../api/client";
import { withInferredReceiptType } from "../../components/receiptFileTypes";

export interface ExpenseReceiptCandidate {
  public_id: string;
  vendor_name: string | null;
  expense_date: string;
  total_amount: string;
  reference_number: string | null;
  is_draft: boolean;
  status: string | null;
  is_completed: boolean;
  vendor_matches: boolean;
  days_apart: number;
}

export interface ExpenseReceiptReadFields {
  vendor_public_id: string | null;
  vendor_name: string | null;
  expense_date: string | null;
  total_amount: string | null;
  reference_number: string | null;
}

export interface ExpenseReceiptReadResponse {
  status: "matched" | "no_match" | "unreadable" | "ai_unavailable" | "disabled" | "timeout";
  message: string | null;
  fields: ExpenseReceiptReadFields;
  candidates: ExpenseReceiptCandidate[];
}

export interface ExpenseReceiptAttachResponse {
  expense_public_id: string;
  expense_line_item_public_id: string;
  attachment_public_id: string;
}

export type ReceiptQueuePhase = "pending" | "uploading" | "reading" | "ready" | "error";

export interface AttachedExpenseSummary {
  public_id: string;
  vendor_name: string | null;
  expense_date: string;
  total_amount: string;
  is_draft: boolean;
}

export interface ReceiptMatchRow {
  id: string;
  file: File;
  phase: ReceiptQueuePhase;
  attachmentPublicId?: string;
  read?: ExpenseReceiptReadResponse;
  readError?: string;
  candidates: ExpenseReceiptCandidate[];
  attachInProgress: boolean;
  attachNotice?: string;
  attached?: AttachedExpenseSummary;
  errorMessage?: string;
  /** Set after attachment_linked — every attach retry would 409. */
  attachBlocked?: boolean;
}

let receiptRowIdCounter = 0;
function allocReceiptRowId(): string {
  receiptRowIdCounter += 1;
  return `expense-receipt-row-${receiptRowIdCounter}`;
}

/** User-facing copy for read-receipt failures (never raw server detail). */
function readReceiptErrorMessage(err: unknown): string {
  if (err instanceof OfflineError) {
    return "You're offline — try again when connected.";
  }
  if (err instanceof ApiError) {
    if (err.status === 404) return "This file can't be read here.";
    if (err.status === 409 && err.detail === "attachment_linked") {
      return "This file is already attached elsewhere.";
    }
    return "Couldn't read this receipt.";
  }
  return "Couldn't read this receipt.";
}

/** User-facing copy for attach-receipt failures (never raw server detail). */
function attachReceiptErrorMessage(err: unknown): string {
  if (err instanceof OfflineError) {
    return "You're offline — try again when connected.";
  }
  if (err instanceof ApiError) {
    if (err.status === 409 && err.detail === "expense_has_receipt") {
      return "That expense already has a receipt";
    }
    if (err.status === 409 && err.detail === "attachment_linked") {
      return "This file is already attached";
    }
    if (err.status === 404) return "Couldn't attach this receipt.";
    return "Couldn't attach this receipt.";
  }
  return "Couldn't attach this receipt.";
}

export function expenseLinkForCandidate(c: { public_id: string; is_draft: boolean }): string {
  return c.is_draft ? `/expense/${c.public_id}/edit` : `/expense/${c.public_id}`;
}

function patchRowInList(rows: ReceiptMatchRow[], id: string, patch: Partial<ReceiptMatchRow>): ReceiptMatchRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

export function useExpenseReceiptMatch(onListRefresh: () => void) {
  const [rows, setRows] = useState<ReceiptMatchRow[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const onListRefreshRef = useRef(onListRefresh);
  onListRefreshRef.current = onListRefresh;

  const processingRef = useRef(false);

  const patchRow = useCallback((id: string, patch: Partial<ReceiptMatchRow>) => {
    const next = patchRowInList(rowsRef.current, id, patch);
    rowsRef.current = next;
    setRows(next);
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      for (;;) {
        const snapshot = rowsRef.current;
        const entry = snapshot.find((e) => e.phase === "pending");
        if (!entry) break;

        const { id, file } = entry;
        patchRow(id, { phase: "uploading", readError: undefined, errorMessage: undefined });

        try {
          const attachment = await uploadFile<{ public_id: string }>(
            "/api/v1/upload/attachment",
            withInferredReceiptType(file),
          );
          patchRow(id, { phase: "reading", attachmentPublicId: attachment.public_id });
          const read = await post<ExpenseReceiptReadResponse>("/api/v1/expense/read-receipt", {
            attachment_public_id: attachment.public_id,
          });
          patchRow(id, {
            phase: "ready",
            read,
            candidates: read.candidates ?? [],
          });
        } catch (err) {
          patchRow(id, {
            phase: "error",
            readError: readReceiptErrorMessage(err),
          });
        }
      }
    } finally {
      processingRef.current = false;
      if (rowsRef.current.some((e) => e.phase === "pending")) {
        void processQueue();
      }
    }
  }, [patchRow]);

  const enqueueFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const newEntries: ReceiptMatchRow[] = files.map((file) => ({
        id: allocReceiptRowId(),
        file,
        phase: "pending",
        candidates: [],
        attachInProgress: false,
      }));
      const next = [...rowsRef.current, ...newEntries];
      rowsRef.current = next;
      setRows(next);
      void processQueue();
    },
    [processQueue],
  );

  const dismissRow = useCallback((id: string) => {
    const next = rowsRef.current.filter((r) => r.id !== id);
    rowsRef.current = next;
    setRows(next);
  }, []);

  const attachToExpense = useCallback(
    async (rowId: string, candidate: ExpenseReceiptCandidate) => {
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row?.attachmentPublicId || row.attachInProgress || row.attached || row.attachBlocked) {
        return;
      }

      patchRow(rowId, { attachInProgress: true, attachNotice: undefined, errorMessage: undefined });

      try {
        await post<ExpenseReceiptAttachResponse>(
          `/api/v1/expense/${candidate.public_id}/attach-receipt`,
          { attachment_public_id: row.attachmentPublicId },
        );
        patchRow(rowId, {
          attachInProgress: false,
          attached: {
            public_id: candidate.public_id,
            vendor_name: candidate.vendor_name,
            expense_date: candidate.expense_date,
            total_amount: candidate.total_amount,
            is_draft: candidate.is_draft,
          },
          candidates: [],
        });
        onListRefreshRef.current();
      } catch (err) {
        const message = attachReceiptErrorMessage(err);
        if (err instanceof ApiError && err.status === 409 && err.detail === "expense_has_receipt") {
          const remaining = row.candidates.filter((c) => c.public_id !== candidate.public_id);
          patchRow(rowId, {
            attachInProgress: false,
            candidates: remaining,
            attachNotice: "That expense already has a receipt",
          });
          return;
        }
        if (err instanceof ApiError && err.status === 409 && err.detail === "attachment_linked") {
          patchRow(rowId, {
            attachInProgress: false,
            attachBlocked: true,
            errorMessage: "This file is already attached",
          });
          return;
        }
        patchRow(rowId, {
          attachInProgress: false,
          errorMessage: message,
        });
      }
    },
    [patchRow],
  );

  return {
    rows,
    enqueueFiles,
    dismissRow,
    attachToExpense,
  };
}
