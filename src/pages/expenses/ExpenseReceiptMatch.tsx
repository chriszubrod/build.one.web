import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import PdfDropZone from "../../components/PdfDropZone";
import {
  expenseLinkForCandidate,
  type ExpenseReceiptCandidate,
  type ExpenseReceiptReadFields,
  type ReceiptMatchRow,
  useExpenseReceiptMatch,
} from "./useExpenseReceiptMatch";
import { EXPENSE_STATUS_LABELS, expenseStatus, expenseStatusBadgeClass } from "./expenseLifecycle";
import { fmtDate, fmtMoney } from "./expenseFormat";

const REJECTED_TYPE_MESSAGE =
  "Only PDF or image receipts (PNG, JPEG, HEIC, HEIF, TIFF) can be matched here.";

const UNAVAILABLE_COPY: Record<"disabled" | "ai_unavailable" | "timeout", string> = {
  disabled: "Receipt reading is turned off.",
  ai_unavailable: "Receipt reading isn't available right now.",
  timeout: "Reading this receipt timed out.",
};

const MANUAL_ATTACH_HINT = (
  <>
    {" "}
    Open the expense and attach it on a line, or use{" "}
    <Link to="/expense/create">New Expense</Link> for an out-of-pocket purchase.
  </>
);

function fieldsSummary(fields: ExpenseReceiptReadFields): string {
  const parts = [
    fields.vendor_name?.trim() || "Unknown vendor",
    fmtDate(fields.expense_date) || "—",
    fmtMoney(fields.total_amount),
  ];
  return parts.join(" · ");
}

function phaseLabel(row: ReceiptMatchRow): string {
  if (row.attached) return "Attached";
  switch (row.phase) {
    case "pending":
      return "Queued…";
    case "uploading":
      return "Uploading…";
    case "reading":
      return "Reading…";
    case "error":
      return "Error";
    case "ready":
      return row.read?.status === "matched" ? "Matches found" : "Done";
    default:
      return "";
  }
}

function CandidateRow({
  candidate,
  attachDisabled,
  onAttach,
}: {
  candidate: ExpenseReceiptCandidate;
  attachDisabled: boolean;
  onAttach: () => void;
}) {
  const lifecycleStatus = expenseStatus({
    status: candidate.status,
    is_draft: candidate.is_draft,
  });
  const badge = EXPENSE_STATUS_LABELS[lifecycleStatus] ?? lifecycleStatus;
  const badgeClass = expenseStatusBadgeClass(lifecycleStatus);
  return (
    <div className="receipt-match-candidate">
      <div className="receipt-match-candidate-main">
        <span className="receipt-match-candidate-vendor">{candidate.vendor_name || "Unknown vendor"}</span>
        <span className="receipt-match-candidate-meta">
          {fmtDate(candidate.expense_date)} · {fmtMoney(candidate.total_amount)}
          {candidate.reference_number ? ` · ${candidate.reference_number}` : ""}
        </span>
        <span className="receipt-match-candidate-badges">
          <span className={`status-badge ${badgeClass}`}>{badge}</span>
          {candidate.vendor_matches && (
            <span className="receipt-match-hint">vendor matches</span>
          )}
          {candidate.days_apart > 0 && (
            <span className="receipt-match-hint">{candidate.days_apart} days apart</span>
          )}
        </span>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={attachDisabled}
        onClick={onAttach}
      >
        Attach
      </button>
    </div>
  );
}

function ReceiptMatchRowView({
  row,
  onDismiss,
  onAttach,
}: {
  row: ReceiptMatchRow;
  onDismiss: () => void;
  onAttach: (candidate: ExpenseReceiptCandidate) => void;
}) {
  const read = row.read;
  const attachDisabled = row.attachInProgress || !!row.attached || !!row.attachBlocked;

  let body: ReactNode = null;

  if (row.attached) {
    const link = expenseLinkForCandidate({
      public_id: row.attached.public_id,
      is_draft: row.attached.is_draft,
    });
    const label = `${row.attached.vendor_name || "Unknown vendor"} ${fmtDate(row.attached.expense_date)} ${fmtMoney(row.attached.total_amount)}`;
    body = (
      <p className="receipt-match-result">
        Attached to <Link to={link}>{label}</Link>
      </p>
    );
  } else if (row.phase === "error" && row.readError) {
    body = <p className="field-error">{row.readError}</p>;
  } else if (row.phase === "ready" && read) {
    if (read.status === "matched") {
      if (row.candidates.length > 0) {
        body = (
          <>
            <p className="receipt-match-fields">{fieldsSummary(read.fields)}</p>
            <div className="receipt-match-candidates">
              {row.candidates.map((c) => (
                <CandidateRow
                  key={c.public_id}
                  candidate={c}
                  attachDisabled={attachDisabled}
                  onAttach={() => onAttach(c)}
                />
              ))}
            </div>
          </>
        );
      } else {
        body = (
          <p className="receipt-match-result">
            No matching expenses found.
            {MANUAL_ATTACH_HINT}
          </p>
        );
      }
    } else if (read.status === "no_match") {
      const total = fmtMoney(read.fields.total_amount);
      const around = fmtDate(read.fields.expense_date) || "that date";
      body = (
        <p className="receipt-match-result">
          No expense without a receipt matches {total} around {around}.
          {MANUAL_ATTACH_HINT}
        </p>
      );
    } else if (read.status === "unreadable") {
      body = (
        <p className="receipt-match-result">
          Couldn&apos;t read a total from this receipt.
          {MANUAL_ATTACH_HINT}
        </p>
      );
    } else if (
      read.status === "disabled" ||
      read.status === "ai_unavailable" ||
      read.status === "timeout"
    ) {
      body = (
        <p className="receipt-match-result">
          {read.message?.trim() || UNAVAILABLE_COPY[read.status]}
        </p>
      );
    }
  }

  return (
    <div className="receipt-match-row">
      <div className="receipt-match-row-header">
        <div className="receipt-match-row-title">
          <span className="receipt-match-filename">{row.file.name}</span>
          <span className="receipt-match-phase">{phaseLabel(row)}</span>
        </div>
        <button
          type="button"
          className="receipt-match-dismiss"
          aria-label={`Dismiss ${row.file.name}`}
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
      {row.attachNotice && <p className="field-error">{row.attachNotice}</p>}
      {row.errorMessage && <p className="field-error">{row.errorMessage}</p>}
      {body}
    </div>
  );
}

export interface ExpenseReceiptMatchProps {
  canUpdate: boolean;
  onListRefresh: () => void;
}

export default function ExpenseReceiptMatch({ canUpdate, onListRefresh }: ExpenseReceiptMatchProps) {
  const { rows, enqueueFiles, dismissRow, attachToExpense } = useExpenseReceiptMatch(onListRefresh);
  const [rejectedMessage, setRejectedMessage] = useState("");

  if (!canUpdate) return null;

  return (
    <>
      <PdfDropZone
        icon="🧾"
        text="Drop receipts to match them to expenses"
        multiple
        allowImages
        onSelect={(accepted, rejected) => {
          if (rejected.length) setRejectedMessage(REJECTED_TYPE_MESSAGE);
          else if (accepted.length) setRejectedMessage("");
          if (accepted.length) enqueueFiles(accepted);
        }}
      >
        {rejectedMessage && <p className="field-error">{rejectedMessage}</p>}
      </PdfDropZone>

      {rows.length > 0 && (
        <div className="receipt-match-panel">
          {rows.map((row) => (
            <ReceiptMatchRowView
              key={row.id}
              row={row}
              onDismiss={() => dismissRow(row.id)}
              onAttach={(candidate) => attachToExpense(row.id, candidate)}
            />
          ))}
        </div>
      )}
    </>
  );
}
