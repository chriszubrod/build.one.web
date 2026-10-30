import type {
  AttachmentBackfillCandidate,
  AttachmentBackfillCandidateDetail,
  AttachmentBackfillSnippet,
} from "../../../types/api";
import {
  SNIPPET_KIND_LABELS,
  SNIPPET_KIND_ORDER,
  billGone,
  contentChanged,
  formatBytes,
  formatCount,
  formatFlag,
  formatMoney,
} from "./backfillModel";

/**
 * The right-hand pane: bill fields, source file, the stored counts and the
 * live snippets. Presentational and NEUTRAL — numbers, flags and the text as
 * printed; no verdict words, no green/red colouring.
 */
export default function CandidateEvidence({
  row,
  detail,
  detailError,
  pdfMatches,
  pdfCheckUnknown = false,
}: {
  row: AttachmentBackfillCandidate;
  detail: AttachmentBackfillCandidateDetail | undefined;
  detailError: string | null;
  pdfMatches: boolean | null | undefined;
  /** The PDF response carried no readable X-Content-Matches-Check (does not block Approve). */
  pdfCheckUnknown?: boolean;
}) {
  // Bill fields come from the freshest copy we hold.
  const src: AttachmentBackfillCandidate = detail ?? row;
  const changed = contentChanged(detail, pdfMatches);
  const gone = billGone(src);

  return (
    <div className="abf-evidence">
      {changed && (
        <div className="abf-notice abf-notice-strong" role="alert" data-testid="abf-content-changed">
          This file has changed in Box since it was checked
        </div>
      )}
      {gone && (
        <div className="abf-notice abf-notice-strong" role="alert" data-testid="abf-bill-gone">
          The bill for this candidate no longer exists
        </div>
      )}
      {src.linked && <div className="abf-notice">Already linked</div>}

      <section className="abf-section">
        <h3>Bill</h3>
        <dl className="abf-fields">
          <dt>Vendor</dt>
          <dd>{src.vendor_name ?? "—"}</dd>
          <dt>Bill #</dt>
          <dd>{src.bill_number ?? "—"}</dd>
          <dt>Date</dt>
          <dd>{src.bill_date ? src.bill_date.slice(0, 10) : "—"}</dd>
          <dt>Amount</dt>
          <dd>{formatMoney(src.total_amount)}</dd>
          <dt>Projects</dt>
          <dd>{src.project_names || src.project_name || "—"}</dd>
        </dl>
      </section>

      <section className="abf-section">
        <h3>Source file</h3>
        <dl className="abf-fields">
          <dt>Name</dt>
          <dd className="abf-break">{src.source_file_name ?? "—"}</dd>
          <dt>Size</dt>
          <dd>{formatBytes(src.source_file_size)}</dd>
        </dl>
      </section>

      <section className="abf-section">
        <h3>Counts</h3>
        <ul className="abf-counts" data-testid="abf-counts">
          <li>Invoice # printed: {formatCount(src.invoice_seen_count)}</li>
          <li>Amount printed: {formatCount(src.amount_seen_count)}</li>
          <li>Vendor name printed: {formatFlag(src.vendor_seen)}</li>
          <li>Other invoice numbers: {formatCount(src.other_invoice_label_count)}</li>
          <li>Statement layout: {formatFlag(src.statement_like)}</li>
          <li>OCR used: {formatFlag(src.used_ocr)}</li>
          <li>Check status: {src.check_status ?? "—"}</li>
          {pdfCheckUnknown && <li data-testid="abf-pdf-check-unknown">PDF check: not available</li>}
        </ul>
      </section>

      <section className="abf-section">
        <h3>Where they are printed</h3>
        {detailError ? (
          <p className="abf-muted">Details unavailable ({detailError})</p>
        ) : !detail ? (
          <p className="abf-muted">Loading…</p>
        ) : detail.snippet_error ? (
          detail.snippet_error === "content_changed" ? (
            <p className="abf-muted">Snippets withheld: the file changed</p>
          ) : (
            <p className="abf-muted">Snippets unavailable ({detail.snippet_error})</p>
          )
        ) : (
          <SnippetGroups snippets={detail.snippets ?? []} />
        )}
      </section>
    </div>
  );
}

function SnippetGroups({ snippets }: { snippets: AttachmentBackfillSnippet[] }) {
  if (snippets.length === 0) return <p className="abf-muted">No snippets</p>;
  return (
    <div data-testid="abf-snippets">
      {SNIPPET_KIND_ORDER.map((kind) => {
        const items = snippets.filter((s) => s.kind === kind);
        if (items.length === 0) return null;
        return (
          <div key={kind} className="abf-snippet-group" data-kind={kind}>
            <h4>
              {SNIPPET_KIND_LABELS[kind]} ({items.length})
            </h4>
            <ul>
              {items.map((s, i) => (
                <li key={i} className="abf-snippet">
                  {s.before}
                  <mark>{s.hit}</mark>
                  {s.after}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
