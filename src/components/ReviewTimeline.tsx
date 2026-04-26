import { useEffect, useState } from "react";
import { getList, post, ApiError } from "../api/client";
import { useCurrentUser } from "../hooks/useCurrentUser";
import type { Review, ReviewParentType } from "../types/api";

interface ReviewTimelineProps {
  parentType: ReviewParentType;
  parentPublicId: string;
  readOnly?: boolean;
}

// API URL slug per parent type. Three of four match snake_case; bill_credit
// uses a hyphen on the API surface.
const URL_SLUG: Record<ReviewParentType, string> = {
  bill: "bill",
  expense: "expense",
  bill_credit: "bill-credit",
  invoice: "invoice",
};

// dbo.Modules.Name per parent. Buttons hide if the current user lacks
// can_update on this module (the same gate the API enforces).
const MODULE_NAME: Record<ReviewParentType, string> = {
  bill: "Bills",
  expense: "Expenses",
  bill_credit: "Bill Credits",
  invoice: "Invoices",
};

type ActionKind = "submit" | "advance" | "decline";

interface ActionDialog {
  kind: ActionKind;
  comments: string;
  busy: boolean;
  error: string;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  // API returns "YYYY-MM-DD HH:MM:SS" already in user-friendly form.
  return iso.replace("T", " ");
}

function fullName(r: Review): string {
  const fn = r.user_firstname ?? "";
  const ln = r.user_lastname ?? "";
  const joined = `${fn} ${ln}`.trim();
  return joined || `User #${r.user_id}`;
}

function StatusPill({ name, color }: { name: string; color: string | null }) {
  return (
    <span
      className="badge"
      style={{
        backgroundColor: color ?? "#888",
        color: "#fff",
        padding: "2px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </span>
  );
}

export default function ReviewTimeline({
  parentType,
  parentPublicId,
  readOnly = false,
}: ReviewTimelineProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [dialog, setDialog] = useState<ActionDialog | null>(null);

  const { data: me } = useCurrentUser();
  const moduleRow = me?.modules?.find((m) => m.name === MODULE_NAME[parentType]);
  const canAct = !readOnly && (me?.is_admin || moduleRow?.can_update || false);

  const slug = URL_SLUG[parentType];
  const fetchPath = `/api/v1/get/reviews/${slug}/${parentPublicId}`;

  const fetchReviews = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await getList<Review>(fetchPath);
      setReviews(res.data);
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to load reviews.");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPath]);

  const current = reviews.length > 0 ? reviews[reviews.length - 1] : null;

  // Available actions based on current state. Server enforces these too —
  // UI hiding is just to avoid offering invalid buttons.
  const canSubmit = !current || current.status_is_declined;
  const canAdvance = !!current && !current.status_is_final && !current.status_is_declined;
  const canDecline = !!current && !current.status_is_final && !current.status_is_declined;

  const openDialog = (kind: ActionKind) => {
    setDialog({ kind, comments: "", busy: false, error: "" });
  };

  const closeDialog = () => setDialog(null);

  const submitDialog = async () => {
    if (!dialog) return;

    // Required-comments rule for decline (UI-only — backend is permissive).
    if (dialog.kind === "decline" && dialog.comments.trim() === "") {
      setDialog({ ...dialog, error: "Comments are required when declining." });
      return;
    }

    setDialog({ ...dialog, busy: true, error: "" });
    try {
      const path = `/api/v1/${dialog.kind}/review/${slug}/${parentPublicId}`;
      const body: Record<string, any> = {
        comments: dialog.comments.trim() || null,
      };
      // Decline auto-resolves the target server-side when only one declined
      // status is configured. If a multi-decline scenario lands, surface
      // a picker here; today there's nothing to choose.
      await post<Review>(path, body);
      await fetchReviews();
      setDialog(null);
    } catch (err: any) {
      const msg =
        err instanceof ApiError ? err.detail : err?.message ?? "Action failed.";
      setDialog({ ...dialog, busy: false, error: msg });
    }
  };

  if (loading) {
    return (
      <div className="text-muted" style={{ marginTop: 16, fontSize: 13 }}>
        Loading review status…
      </div>
    );
  }

  // Empty state: hide the timeline entirely. Show only "Submit for Review"
  // when the user can act. In readOnly with no reviews, render nothing.
  if (!current) {
    if (!canAct) return null;
    return (
      <div className="review-banner" style={bannerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="text-muted" style={{ fontSize: 13 }}>
            No review yet.
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => openDialog("submit")}
          >
            Submit for Review
          </button>
        </div>
        {dialog && (
          <ActionModal
            dialog={dialog}
            onClose={closeDialog}
            onSubmit={submitDialog}
            onChangeComments={(v) => setDialog({ ...dialog, comments: v })}
          />
        )}
      </div>
    );
  }

  const declinedNote = current.status_is_declined
    ? " · Declined — resubmit to restart"
    : "";

  return (
    <div className="review-banner" style={bannerStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>Review:</span>
        <StatusPill name={current.status_name} color={current.status_color} />
        <span className="text-muted" style={{ fontSize: 12 }}>
          by {fullName(current)} · {formatTimestamp(current.created_datetime)}
          {declinedNote}
        </span>

        <div style={{ flex: 1 }} />

        {canAct && canAdvance && (
          <button
            type="button"
            className="btn btn-success btn-sm"
            onClick={() => openDialog("advance")}
          >
            Advance →
          </button>
        )}
        {canAct && canDecline && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => openDialog("decline")}
          >
            Decline
          </button>
        )}
        {canAct && canSubmit && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => openDialog("submit")}
          >
            {current.status_is_declined ? "Resubmit" : "Submit for Review"}
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide history" : `History (${reviews.length})`}
        </button>
      </div>

      {loadError && (
        <div className="form-error" style={{ marginTop: 8 }}>
          {loadError}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 12 }}>
          <ol
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              borderLeft: "2px solid #ccc",
              paddingLeft: 12,
            }}
          >
            {reviews.map((r) => (
              <li
                key={r.public_id}
                style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.4 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <StatusPill name={r.status_name} color={r.status_color} />
                  <span className="text-muted">
                    by {fullName(r)} · {formatTimestamp(r.created_datetime)}
                  </span>
                </div>
                {r.comments && (
                  <div style={{ marginTop: 4, color: "#333" }}>
                    {r.comments}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {dialog && (
        <ActionModal
          dialog={dialog}
          onClose={closeDialog}
          onSubmit={submitDialog}
          onChangeComments={(v) => setDialog({ ...dialog, comments: v })}
        />
      )}
    </div>
  );
}

const bannerStyle: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 12,
  padding: 12,
  border: "1px solid #ddd",
  borderRadius: 6,
  backgroundColor: "#fafafa",
};

interface ActionModalProps {
  dialog: ActionDialog;
  onClose: () => void;
  onSubmit: () => void;
  onChangeComments: (v: string) => void;
}

function ActionModal({
  dialog,
  onClose,
  onSubmit,
  onChangeComments,
}: ActionModalProps) {
  const titleByKind: Record<ActionKind, string> = {
    submit: "Submit for Review",
    advance: "Advance Review",
    decline: "Decline Review",
  };
  const requiredComments = dialog.kind === "decline";

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "#fff",
          padding: 20,
          borderRadius: 8,
          width: "min(440px, 92vw)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ margin: "0 0 12px 0", fontSize: 16 }}>
          {titleByKind[dialog.kind]}
        </h3>
        <label
          style={{ display: "block", fontSize: 13, marginBottom: 4, color: "#555" }}
        >
          Comments {requiredComments && <span style={{ color: "#c00" }}>*</span>}
        </label>
        <textarea
          autoFocus
          rows={4}
          className="inline-li-input"
          style={{ width: "100%", resize: "vertical" }}
          value={dialog.comments}
          onChange={(e) => onChangeComments(e.target.value)}
          placeholder={
            requiredComments
              ? "Explain why you're declining…"
              : "Optional notes for the audit log…"
          }
          disabled={dialog.busy}
        />
        {dialog.error && (
          <div className="form-error" style={{ marginTop: 8 }}>
            {dialog.error}
          </div>
        )}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={dialog.busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={
              dialog.kind === "decline"
                ? "btn btn-danger btn-sm"
                : dialog.kind === "advance"
                ? "btn btn-success btn-sm"
                : "btn btn-primary btn-sm"
            }
            onClick={onSubmit}
            disabled={dialog.busy}
          >
            {dialog.busy ? "Working…" : titleByKind[dialog.kind]}
          </button>
        </div>
      </div>
    </div>
  );
}
