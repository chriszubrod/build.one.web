import { Link } from "react-router-dom";
import Sheet from "./ui/Sheet";
import SheetHeader from "./ui/SheetHeader";
import { formatMoneyParts } from "./MoneyCell";
import {
  DOCUMENT_STATUS_LABELS,
  documentStatusBadgeClass,
} from "../shared/documentLifecycle";
import type { PossibleDuplicateMatch, PossibleDuplicateReason } from "../pages/bills/possibleDuplicate";

const REASON_LABELS: Record<PossibleDuplicateReason, string> = {
  vendor_date_amount: "Same vendor, date & amount",
  same_document_text: "Same PDF content",
  same_number_amount_date: "Same bill #, date & amount (another vendor)",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format API date-only "YYYY-MM-DD" without `new Date("YYYY-MM-DD")` UTC shift. */
function formatBillDate(dateOnly: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly);
  if (!m) return dateOnly;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const month = MONTHS[mo - 1] ?? "";
  return `${month} ${d}, ${y}`;
}

function statusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status] ?? status;
}

export interface PossibleDuplicateDialogProps {
  open: boolean;
  matches: PossibleDuplicateMatch[];
  hiddenCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function PossibleDuplicateDialog({
  open,
  matches,
  hiddenCount,
  onCancel,
  onConfirm,
}: PossibleDuplicateDialogProps) {
  return (
    <Sheet open={open} onDismiss={onCancel}>
      <SheetHeader title="Possible duplicate bill" onCancel={onCancel} />
      <div className="sheet-body">
        <p className="sheet-hint">
          These bills look similar to what you are saving. Review them, then continue only if this
          is a separate bill.
        </p>
        <ul className="possible-duplicate-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {matches.map((m) => {
            const money = formatMoneyParts(m.total_amount);
            return (
              <li
                key={m.public_id}
                className="possible-duplicate-row"
                style={{
                  border: "1px solid var(--border-color, #ddd)",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <div style={{ fontWeight: 600 }}>{m.vendor_name || "Unknown vendor"}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>
                  Bill{" "}
                  <Link
                    to={`/bill/${m.public_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {m.bill_number || m.public_id}
                  </Link>
                  {" · "}
                  {formatBillDate(m.bill_date)}
                  {money ? (
                    <>
                      {" · "}
                      {money.text}
                    </>
                  ) : null}
                </div>
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span
                    className={`status-badge ${documentStatusBadgeClass(m.status)}`}
                  >
                    {statusLabel(m.status)}
                  </span>
                  {m.project_names.length > 0 ? (
                    <span className="text-muted" style={{ fontSize: 13 }}>
                      {m.project_names.join(", ")}
                    </span>
                  ) : null}
                </div>
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {m.reasons.map((r) => (
                    <span key={r} className="badge" style={{ fontSize: 12 }}>
                      {REASON_LABELS[r]}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        {hiddenCount > 0 ? (
          <p className="text-muted" style={{ fontSize: 13 }}>
            {hiddenCount} more matching bill{hiddenCount === 1 ? "" : "s"} you don&apos;t have access
            to
          </p>
        ) : null}
        <div className="form-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-secondary"
            autoFocus
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
          >
            It&apos;s not a duplicate — continue
          </button>
        </div>
      </div>
    </Sheet>
  );
}
