import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getOne, post, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";

interface WorkflowEvent {
  event_type: string | null;
  from_state: string | null;
  to_state: string | null;
  step_name: string | null;
  created_by: string | null;
  created_datetime: string | null;
  data: Record<string, unknown> | null;
}

interface Workflow {
  public_id: string;
  workflow_type: string | null;
  state: string | null;
  created_datetime: string | null;
  modified_datetime: string | null;
  completed_datetime: string | null;
  context: Record<string, unknown> | null;
}

interface Summary {
  vendor_id: number | null;
  vendor_name: string | null;
  project_id: number | null;
  bill_id: number | null;
}

interface WorkflowDetail {
  workflow: Workflow;
  events: WorkflowEvent[];
  summary: Summary;
}

interface ActionResult {
  success: boolean;
  state: string;
  message: string;
}

type ModalKind = "cancel" | "approve" | "reject" | null;

const FINAL_STATES = new Set(["completed", "cancelled", "abandoned", "rejected"]);

const badgeColor = (s: string | null): string => {
  switch (s) {
    case "completed":
      return "#16a34a";
    case "failed":
      return "#dc2626";
    case "awaiting_approval":
      return "#d97706";
    case "cancelled":
    case "abandoned":
    case "rejected":
      return "#64748b";
    default:
      return "#2563eb";
  }
};

const fmtDate = (s: string | null): string => {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString();
};

const fmtType = (s: string | null): string =>
  !s ? "—" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);
  const [acting, setActing] = useState(false);

  const [cancelReason, setCancelReason] = useState("");
  const [approveProjectId, setApproveProjectId] = useState("");
  const [approveCostCode, setApproveCostCode] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setDetail(await getOne<WorkflowDetail>(`/api/v1/workflow/${id}`));
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load workflow.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (
    doAction: () => Promise<ActionResult>,
    successLabel: string,
  ) => {
    setActing(true);
    try {
      const res = await doAction();
      toast(res.message || successLabel, res.success ? "success" : "error");
      setModal(null);
      setCancelReason("");
      setApproveProjectId("");
      setApproveCostCode("");
      setRejectReason("");
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.detail : "Action failed.", "error");
    } finally {
      setActing(false);
    }
  };

  const handleRetry = () =>
    runAction(
      () => post<ActionResult>(`/api/v1/workflow/${id}/retry`, {}),
      "Workflow retried.",
    );

  const handleCancel = () =>
    runAction(
      () =>
        post<ActionResult>(`/api/v1/workflow/${id}/cancel`, {
          reason: cancelReason || null,
        }),
      "Workflow cancelled.",
    );

  const handleApprove = () => {
    const projectId = parseInt(approveProjectId, 10);
    if (isNaN(projectId) || projectId < 1) {
      toast("Project ID is required.", "error");
      return;
    }
    if (!approveCostCode.trim()) {
      toast("Cost code is required.", "error");
      return;
    }
    return runAction(
      () =>
        post<ActionResult>(`/api/v1/workflow/${id}/approve`, {
          project_id: projectId,
          cost_code: approveCostCode.trim(),
        }),
      "Workflow approved.",
    );
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast("Rejection reason is required.", "error");
      return;
    }
    return runAction(
      () =>
        post<ActionResult>(`/api/v1/workflow/${id}/reject`, {
          reason: rejectReason.trim(),
        }),
      "Workflow rejected.",
    );
  };

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!detail) return <div className="page-error">Workflow not found.</div>;

  const { workflow, events, summary } = detail;
  const canRetry = workflow.state === "failed" || workflow.state === "needs_review";
  const canApproveReject = workflow.state === "awaiting_approval";
  const canCancel = workflow.state ? !FINAL_STATES.has(workflow.state) : false;

  return (
    <div className="page">
      <div
        className="page-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Workflow Details</h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 12 }}>
            <Meta label="ID" value={<code>{workflow.public_id}</code>} />
            <Meta label="Type" value={fmtType(workflow.workflow_type)} />
            <Meta
              label="State"
              value={
                <span
                  style={{
                    color: badgeColor(workflow.state),
                    fontWeight: 500,
                    textTransform: "capitalize",
                  }}
                >
                  {(workflow.state ?? "—").replace(/_/g, " ")}
                </span>
              }
            />
            <Meta label="Created" value={fmtDate(workflow.created_datetime)} />
            <Meta label="Updated" value={fmtDate(workflow.modified_datetime)} />
            {workflow.completed_datetime && (
              <Meta label="Completed" value={fmtDate(workflow.completed_datetime)} />
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canRetry && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRetry}
              disabled={acting}
            >
              Retry
            </button>
          )}
          {canApproveReject && (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setModal("approve")}
                disabled={acting}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setModal("reject")}
                disabled={acting}
              >
                Reject
              </button>
            </>
          )}
          {canCancel && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setModal("cancel")}
              disabled={acting}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/admin")}
          >
            Back to Admin
          </button>
        </div>
      </div>

      {(summary.vendor_id || summary.project_id || summary.bill_id) && (
        <div className="detail-card" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 12px" }}>Related Entities</h2>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {summary.vendor_id && (
              <Link to={`/vendor/${summary.vendor_id}`}>
                <strong>Vendor:</strong> {summary.vendor_name ?? `ID ${summary.vendor_id}`}
              </Link>
            )}
            {summary.project_id && (
              <Link to={`/project/${summary.project_id}`}>
                <strong>Project:</strong> ID {summary.project_id}
              </Link>
            )}
            {summary.bill_id && (
              <Link to={`/bill/${summary.bill_id}`}>
                <strong>Bill:</strong> ID {summary.bill_id}
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="detail-card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Event Timeline</h2>
        {events.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)" }}>No events recorded.</p>
        ) : (
          <div style={{ position: "relative" }}>
            {events.map((ev, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  paddingBottom: 16,
                  marginBottom: 16,
                  borderBottom:
                    i === events.length - 1 ? "none" : "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: eventDotColor(ev),
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>{eventTitle(ev)}</strong>
                    <span
                      style={{ fontSize: 12, color: "var(--color-text-secondary)" }}
                    >
                      {fmtDate(ev.created_datetime)}
                    </span>
                  </div>
                  {(ev.from_state || ev.to_state) && (
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      <code style={{ color: "#64748b" }}>
                        {ev.from_state ?? "initial"}
                      </code>{" "}
                      →{" "}
                      <code style={{ color: badgeColor(ev.to_state) }}>
                        {ev.to_state ?? "—"}
                      </code>
                    </div>
                  )}
                  {ev.created_by && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-secondary)",
                        marginTop: 4,
                      }}
                    >
                      By: {ev.created_by}
                    </div>
                  )}
                  {ev.data && Object.keys(ev.data).length > 0 && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontSize: 12 }}>
                        Event data
                      </summary>
                      <pre
                        style={{
                          fontSize: 11,
                          background: "#f8fafc",
                          padding: 8,
                          borderRadius: 4,
                          overflow: "auto",
                          marginTop: 4,
                        }}
                      >
                        {JSON.stringify(ev.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal === "cancel" && (
        <Modal
          title="Cancel Workflow"
          onClose={() => setModal(null)}
          actions={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModal(null)}
              >
                No, Keep It
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleCancel}
                disabled={acting}
              >
                {acting ? "Cancelling..." : "Yes, Cancel Workflow"}
              </button>
            </>
          }
        >
          <p>Are you sure you want to cancel this workflow? This action cannot be undone.</p>
          <div className="form-group">
            <label htmlFor="cancel-reason">Reason (optional)</label>
            <textarea
              id="cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter reason for cancellation..."
            />
          </div>
        </Modal>
      )}

      {modal === "approve" && (
        <Modal
          title="Approve Workflow"
          onClose={() => setModal(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApprove}
                disabled={acting}
              >
                {acting ? "Approving..." : "Approve"}
              </button>
            </>
          }
        >
          <p>Approve this workflow by providing project and cost code details.</p>
          <div className="form-group">
            <label htmlFor="approve-project-id">
              Project ID <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              id="approve-project-id"
              type="number"
              min={1}
              value={approveProjectId}
              onChange={(e) => setApproveProjectId(e.target.value)}
              placeholder="Enter project ID"
            />
          </div>
          <div className="form-group">
            <label htmlFor="approve-cost-code">
              Cost Code <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              id="approve-cost-code"
              type="text"
              value={approveCostCode}
              onChange={(e) => setApproveCostCode(e.target.value)}
              placeholder="Enter cost code"
            />
          </div>
        </Modal>
      )}

      {modal === "reject" && (
        <Modal
          title="Reject Workflow"
          onClose={() => setModal(null)}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleReject}
                disabled={acting}
              >
                {acting ? "Rejecting..." : "Reject Workflow"}
              </button>
            </>
          }
        >
          <p>Reject this workflow. Please provide a reason.</p>
          <div className="form-group">
            <label htmlFor="reject-reason">
              Reason <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter reason for rejection..."
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Modal({
  title,
  children,
  actions,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 8,
          padding: 24,
          maxWidth: 480,
          width: "calc(100% - 32px)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.25)",
        }}
      >
        <h3 style={{ margin: "0 0 16px" }}>{title}</h3>
        <div>{children}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          {actions}
        </div>
      </div>
    </div>
  );
}

function eventDotColor(ev: WorkflowEvent): string {
  if (ev.event_type === "error") return "#dc2626";
  if (ev.event_type === "state_changed") {
    if (ev.to_state === "completed") return "#16a34a";
    if (ev.to_state === "awaiting_approval") return "#d97706";
    if (ev.to_state === "failed") return "#dc2626";
  }
  return "#2563eb";
}

function eventTitle(ev: WorkflowEvent): string {
  if (ev.event_type === "state_changed") return "State Changed";
  if (ev.event_type === "step_completed")
    return `Step Completed: ${ev.step_name ?? "Unknown"}`;
  if (ev.event_type === "error") return "Error";
  if (ev.event_type === "human_response") return "Human Response";
  return ev.event_type
    ? ev.event_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Event";
}
