import { useParams, Link } from "react-router-dom";
import { useEntityItem } from "../../hooks/useEntity";
import Breadcrumb from "../../components/Breadcrumb";
import type { EmailMessage } from "../../types/api";

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMoney(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtConfidence(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function fmtSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EmailView() {
  const { id } = useParams<{ id: string }>();
  const { item, loading, error } = useEntityItem<EmailMessage>(`/api/v1/get/email-message/${id}`);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Email not found.</div>;

  const bodyIsHtml = (item.body_content_type || "").toLowerCase() === "html";

  return (
    <div className="page">
      <Breadcrumb
        crumbs={[
          { label: "Email Inbox", path: "/email-message/list" },
          { label: item.subject || "(no subject)" },
        ]}
      />

      <div className="page-header">
        <h1 style={{ marginBottom: 4 }}>{item.subject || "(no subject)"}</h1>
      </div>

      {/* Header card — sender, recipients, status */}
      <div className="detail-card">
        <div className="detail-fields">
          <div className="detail-row">
            <dt>From</dt>
            <dd>{item.from_name ? `${item.from_name} <${item.from_address}>` : item.from_address}</dd>
          </div>
          {item.to_recipients && (
            <div className="detail-row">
              <dt>To</dt>
              <dd>{item.to_recipients}</dd>
            </div>
          )}
          {item.cc_recipients && (
            <div className="detail-row">
              <dt>Cc</dt>
              <dd>{item.cc_recipients}</dd>
            </div>
          )}
          <div className="detail-row">
            <dt>Received</dt>
            <dd>{fmtDate(item.received_datetime)}</dd>
          </div>
          <div className="detail-row">
            <dt>Status</dt>
            <dd><span className="badge">{item.processing_status}</span></dd>
          </div>
          {item.web_link && (
            <div className="detail-row">
              <dt>Outlook</dt>
              <dd>
                <a href={item.web_link} target="_blank" rel="noopener noreferrer">Open in Outlook</a>
              </dd>
            </div>
          )}
        </div>
      </div>

      {/* Agent decision */}
      {(item.agent_classification || item.agent_decided_action || item.agent_classification_reason) && (
        <div className="detail-card" style={{ marginTop: 16 }}>
          <h3 className="line-items-heading">Agent Decision</h3>
          <div className="detail-fields">
            <div className="detail-row">
              <dt>Classification</dt>
              <dd>{item.agent_classification || "—"}</dd>
            </div>
            <div className="detail-row">
              <dt>Action</dt>
              <dd>{item.agent_decided_action || "—"}</dd>
            </div>
            <div className="detail-row">
              <dt>Confidence</dt>
              <dd>{fmtConfidence(item.agent_classification_confidence)}</dd>
            </div>
            {item.agent_classification_reason && (
              <div className="detail-row">
                <dt>Reason</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>{item.agent_classification_reason}</dd>
              </div>
            )}
            {item.agent_session_id && (
              <div className="detail-row">
                <dt>Agent session</dt>
                <dd>
                  <code style={{ fontSize: 12 }}>session id {item.agent_session_id}</code>
                </dd>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Linked Bill */}
      {item.linked_bill && (
        <div className="detail-card" style={{ marginTop: 16 }}>
          <h3 className="line-items-heading">Linked Bill</h3>
          <div className="detail-fields">
            <div className="detail-row">
              <dt>Vendor</dt>
              <dd>{item.linked_bill.vendor_name || "—"}</dd>
            </div>
            <div className="detail-row">
              <dt>Bill #</dt>
              <dd>
                <Link to={`/bill/${item.linked_bill.public_id}`}>
                  {item.linked_bill.bill_number || "(no number)"}
                </Link>
              </dd>
            </div>
            <div className="detail-row">
              <dt>Total</dt>
              <dd>{fmtMoney(item.linked_bill.total_amount)}</dd>
            </div>
            <div className="detail-row">
              <dt>Status</dt>
              <dd><span className="badge">{item.linked_bill.is_draft ? "Draft" : "Final"}</span></dd>
            </div>
            <div className="detail-row">
              <dt>Created</dt>
              <dd>{fmtDate(item.linked_bill.created_datetime)}</dd>
            </div>
          </div>
        </div>
      )}

      {/* Attachments */}
      {item.attachments && item.attachments.length > 0 && (
        <div className="detail-card" style={{ marginTop: 16 }}>
          <h3 className="line-items-heading">Attachments ({item.attachments.length})</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Extraction</th>
                  <th>Vendor (DI)</th>
                  <th>Invoice # (DI)</th>
                  <th>Total (DI)</th>
                  <th>Bridged</th>
                </tr>
              </thead>
              <tbody>
                {item.attachments.map((a) => (
                  <tr key={a.public_id}>
                    <td>
                      {a.blob_url ? (
                        <a href={a.blob_url} target="_blank" rel="noopener noreferrer">{a.filename || "(no name)"}</a>
                      ) : (
                        a.filename || "(no name)"
                      )}
                    </td>
                    <td>{fmtSize(a.size_bytes)}</td>
                    <td>
                      <span className="badge">{a.extraction_status || "not run"}</span>
                      {a.extraction_error && <div className="text-muted" style={{ fontSize: 12 }}>{a.extraction_error}</div>}
                    </td>
                    <td>{a.di_vendor_name || "—"}</td>
                    <td>{a.di_invoice_number || "—"}</td>
                    <td>{a.di_total_amount || "—"}</td>
                    <td>{a.bridged_attachment_public_id ? "Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="detail-card" style={{ marginTop: 16 }}>
        <h3 className="line-items-heading">Body</h3>
        {bodyIsHtml && item.body_content ? (
          <iframe
            title="email-body"
            srcDoc={item.body_content}
            sandbox=""
            style={{ width: "100%", minHeight: 400, border: "1px solid var(--color-border)", borderRadius: 4 }}
          />
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14 }}>
            {item.body_content || item.body_preview || "(no body)"}
          </pre>
        )}
      </div>
    </div>
  );
}
