import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { post, uploadFile } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import { computeBillLine } from "./lineMath";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import Breadcrumb, { entityCrumbs } from "../../components/Breadcrumb";
import type { Bill } from "../../types/api";
import { hasBillPermission } from "./billPermissions";

interface AttachmentResponse {
  public_id: string;
  content_type: string | null;
}

// Local shape for the single placeholder line item entered alongside the
// bill header. Same field names as BillEdit's LineItemRow so the compute
// helpers + downstream POST payload line up.
interface LineItemDraft {
  project_public_id: string;
  sub_cost_code_id: string;
  description: string;
  quantity: string;
  rate: string;
  amount: string;
  markup: string;
  price: string;
  is_billable: boolean;
}

const EMPTY_LINE: LineItemDraft = {
  project_public_id: "",
  sub_cost_code_id: "",
  description: "",
  quantity: "1",
  rate: "",
  amount: "",
  markup: "",
  price: "",
  is_billable: true,
};

function fmtMoney(v: string): string {
  if (!v) return "$0.00";
  const n = Number(v);
  if (isNaN(n)) return v;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function BillCreate() {
  const navigate = useNavigate();
  const { data: lookups } = useLookups("vendors,payment_terms,sub_cost_codes,projects");
  const { data: me } = useCurrentUser();
  const { toast } = useToast();
  // Complete bypasses Review entirely — straight to IsDraft=False + outbox
  // (SharePoint, Excel, QBO). The API gates it on Modules.BILLS.can_complete;
  // we mirror that here so the button only shows when it would actually work.
  // System admins bypass the module check on the server side; bypass here too.
  const canCompleteBills = hasBillPermission(me, "can_complete");
  const [form, setForm] = useState({
    vendor_public_id: "",
    payment_term_public_id: "",
    bill_date: "",
    due_date: "",
    bill_number: "",
    memo: "",
  });
  // Multiple line items. Start with one empty row; user can + Add / × Remove.
  // Empty rows (no user-entered fields — see isLinePopulated) are silently
  // dropped at submit time, matching the "hasLineData" behavior used before
  // multi-line support landed.
  const [lines, setLines] = useState<LineItemDraft[]>([EMPTY_LINE]);
  const [file, setFile] = useState<File | null>(null);
  // Browser blob URL for rendering the selected PDF in an iframe pre-upload.
  // Built + revoked via useEffect below so we don't leak object URLs across
  // successive selections.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Three mutually-exclusive in-flight actions collapsed into one state.
  // null = idle. The button labels + disabled gates branch off this value
  // instead of three separate booleans.
  const [busyAction, setBusyAction] = useState<"save" | "submit" | "complete" | null>(null);
  const busy = busyAction !== null;
  const [saveError, setSaveError] = useState("");
  // Which button triggered the submit? All three buttons are type="submit"
  // so HTML required-field validation runs uniformly; we just need to
  // remember which one fired the form's submit event. A ref (not state)
  // because we don't render off of it and need to read it synchronously
  // inside onSubmit.
  const pendingActionRef = useRef<"save" | "submit" | "complete" | null>(null);
  // Auto-calc DueDate from PaymentTerm.due_days + BillDate BY DEFAULT.
  // Flip to false the moment the user hand-edits DueDate, so their manual
  // value isn't clobbered by a later BillDate change. Picking a new
  // PaymentTerm resets the flag — that's the "re-arm auto-calc" gesture.
  const dueDateAutoRef = useRef(true);

  // Preselect "Due on receipt" once lookups load, unless the user has already
  // picked a term. Idempotent — the guard on `form.payment_term_public_id`
  // stops the default from re-applying after the user clears the field.
  useEffect(() => {
    if (!lookups.payment_terms || form.payment_term_public_id) return;
    const defaultTerm = lookups.payment_terms.find(
      (pt) => (pt.name || "").toLowerCase() === "due on receipt",
    );
    if (defaultTerm) {
      setForm((prev) => ({ ...prev, payment_term_public_id: defaultTerm.public_id }));
    }
  }, [lookups.payment_terms, form.payment_term_public_id]);

  // Auto-calc DueDate = BillDate + PaymentTerm.due_days whenever either
  // input changes AND the user hasn't manually edited DueDate since the
  // last PaymentTerm pick. `due_days === null` (unset on the term) → skip.
  useEffect(() => {
    if (!dueDateAutoRef.current) return;
    if (!form.bill_date || !form.payment_term_public_id || !lookups.payment_terms) return;
    const term = lookups.payment_terms.find((pt) => pt.public_id === form.payment_term_public_id);
    if (!term || term.due_days === null || term.due_days === undefined) return;
    // Parse the ISO date at local midnight to avoid a UTC-boundary off-by-one
    // when the browser's timezone is west of UTC (e.g. Central shifts a
    // midnight-UTC parse back a day).
    const bd = new Date(form.bill_date + "T00:00:00");
    if (isNaN(bd.getTime())) return;
    const dd = new Date(bd.getTime() + term.due_days * 86400000);
    const y = dd.getFullYear();
    const m = String(dd.getMonth() + 1).padStart(2, "0");
    const d = String(dd.getDate()).padStart(2, "0");
    const iso = `${y}-${m}-${d}`;
    if (iso !== form.due_date) {
      setForm((prev) => ({ ...prev, due_date: iso }));
    }
  }, [form.bill_date, form.payment_term_public_id, form.due_date, lookups.payment_terms]);

  const onChange = (name: string, value: string) => {
    // Manual DueDate edit turns auto-calc OFF; picking a new PaymentTerm
    // re-arms it. Anything else leaves the flag alone.
    if (name === "due_date") {
      dueDateAutoRef.current = false;
    } else if (name === "payment_term_public_id") {
      dueDateAutoRef.current = true;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const updateLine = (index: number, key: keyof LineItemDraft, value: string | boolean) => {
    setLines((prev) =>
      prev.map((li, i) =>
        i === index ? computeBillLine({ ...li, [key]: value } as LineItemDraft) : li,
      ),
    );
  };

  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);

  const removeLine = (index: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  // A line "has user data" iff the user entered anything in one of the
  // action-relevant fields. Defaults (quantity="1", is_billable=true) don't
  // count — otherwise every fresh row would look populated. Empty rows are
  // silently dropped at submit time per the (a) call.
  const isLinePopulated = (li: LineItemDraft): boolean =>
    li.project_public_id !== "" ||
    li.sub_cost_code_id !== "" ||
    li.description !== "" ||
    li.rate !== "";

  // Build (and revoke) a blob URL for the selected PDF so we can preview it
  // in an iframe before upload. Cleanup runs on file change / unmount, so a
  // second selection doesn't leak the first URL.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = (f: File | null): boolean => {
    if (!f) return false;
    if (f.type !== "application/pdf") {
      setSaveError("Only PDF files are allowed.");
      return false;
    }
    setSaveError("");
    setFile(f);
    return true;
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!acceptFile(f)) {
      setFile(null);
      e.target.value = "";
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) acceptFile(dropped);
  };

  // Drop empty rows (per the (a) call). Everything downstream — buildBody,
  // the additional-line POST loop, gates, and totals — operates on this
  // filtered list. `hasLineData` is now "is any row populated?".
  const populatedLines = lines.filter(isLinePopulated);
  const hasLineData = populatedLines.length > 0;

  // Submit For Review needs at least one populated line with a project so
  // the API's recipient resolver can find PMs/Owners (K06988 bug on empty
  // resolution). Any populated line with a project is enough — a bill can
  // legitimately span multiple projects, and the resolver walks all of them.
  const canSubmitForReview = populatedLines.some((li) => !!li.project_public_id);

  // Complete needs EVERY populated line to have both project AND SCC —
  // completion enqueues one SharePoint upload per project and one Excel row
  // per SCC; missing either dead-letters that outbox row. Requires at least
  // one populated line so there's anything to complete.
  const canCompleteFromHere =
    hasLineData &&
    populatedLines.every((li) => !!li.project_public_id && !!li.sub_cost_code_id);

  // Bill.TotalAmount = sum of all populated lines' amounts. Server writes
  // this to the header; per-line values live on the individual BLIs. Empty
  // rows contribute nothing (they're already filtered out).
  const totalAmount = populatedLines.reduce(
    (sum, li) => sum + (li.amount !== "" ? Number(li.amount) : 0),
    0,
  );

  const buildBody = (submitForReview: boolean) => {
    // First populated line becomes the inline `line_*` summary — the
    // API's create endpoint takes ONE summary and auto-creates the
    // corresponding BillLineItem (the one the attachment links to).
    // Any additional populated lines get POSTed separately after the
    // bill is created (see handleSubmit).
    const first = populatedLines[0];
    const body: Record<string, unknown> = {
      vendor_public_id: form.vendor_public_id,
      payment_term_public_id: form.payment_term_public_id || null,
      bill_date: form.bill_date,
      due_date: form.due_date,
      bill_number: form.bill_number,
      // Sum across ALL populated lines — the header value reflects the
      // full bill, not just the summary line.
      total_amount: hasLineData ? totalAmount : null,
      memo: form.memo || null,
      is_draft: true,
      submit_for_review: submitForReview,
    };
    if (first) {
      body.line_description = first.description || null;
      body.line_quantity = first.quantity !== "" ? Number(first.quantity) : null;
      body.line_rate = first.rate !== "" ? Number(first.rate) : null;
      body.line_amount = first.amount !== "" ? Number(first.amount) : null;
      body.line_markup = first.markup !== "" ? Number(first.markup) : null;
      body.line_price = first.price !== "" ? Number(first.price) : null;
      body.line_is_billable = first.is_billable;
      body.line_sub_cost_code_id =
        first.sub_cost_code_id !== "" ? Number(first.sub_cost_code_id) : null;
      body.line_project_public_id = first.project_public_id || null;
    }
    return body;
  };

  const handleSubmit = async (action: "save" | "submit" | "complete") => {
    if (!file) {
      setSaveError("A PDF attachment is required.");
      return;
    }
    setBusyAction(action);
    setSaveError("");
    try {
      const attachment = await uploadFile<AttachmentResponse>(
        "/api/v1/upload/attachment",
        file,
      );
      // Complete bypasses Review entirely — never auto-Submit on create.
      const submitForReview = action === "submit";
      const created = await post<Bill>("/api/v1/create/bill", {
        ...buildBody(submitForReview),
        attachment_public_id: attachment.public_id,
      });

      // Additional populated lines beyond the inline summary. Each one is
      // its own POST — the API has no batch-create-with-lines endpoint. If
      // any of them fails, the bill still exists (with its summary line and
      // attachment); we redirect to /edit with a toast and let the user
      // finish there. Reversing the bill would need a server transaction we
      // don't have and would lose the attachment upload work.
      const additionalLines = populatedLines.slice(1);
      const failedLineNumbers: number[] = [];
      for (let i = 0; i < additionalLines.length; i++) {
        const li = additionalLines[i];
        try {
          await post("/api/v1/create/bill_line_item", {
            bill_public_id: created.public_id,
            sub_cost_code_id:
              li.sub_cost_code_id !== "" ? Number(li.sub_cost_code_id) : null,
            project_public_id: li.project_public_id || null,
            description: li.description || null,
            quantity: li.quantity !== "" ? Number(li.quantity) : null,
            rate: li.rate !== "" ? Number(li.rate) : null,
            amount: li.amount !== "" ? Number(li.amount) : null,
            is_billable: li.is_billable,
            markup: li.markup !== "" ? Number(li.markup) : null,
            price: li.price !== "" ? Number(li.price) : null,
          });
        } catch {
          // +2 because populatedLines[0] is line #1 (summary), so
          // additionalLines[0] is line #2, etc. Human-readable numbering.
          failedLineNumbers.push(i + 2);
        }
      }
      if (failedLineNumbers.length > 0) {
        toast(
          `Bill saved. ` +
            `${failedLineNumbers.length === 1 ? "Line" : "Lines"} ` +
            `${failedLineNumbers.join(", ")} failed to save — ` +
            `add ${failedLineNumbers.length === 1 ? "it" : "them"} on the edit page.`,
          "error",
        );
        navigate(`/bill/${created.public_id}/edit`);
        return;
      }

      if (action === "complete") {
        try {
          // /complete/bill returns 202 (background); navigate immediately,
          // user sees the bill transition on the detail page.
          await post(`/api/v1/complete/bill/${created.public_id}`, {});
        } catch (completeErr: any) {
          // Bill was created OK but completion failed. Re-attempting
          // from this form would hit a (vendor, bill_number, date)
          // uniqueness 409. Send the user to the edit page where the
          // Complete button on BillEdit can retry against the already-
          // created draft.
          toast(
            `Bill saved as draft. Completion failed: ${completeErr.message}. ` +
              `Retry Complete from this page.`,
            "error",
          );
          navigate(`/bill/${created.public_id}/edit`);
          return;
        }
      }
      navigate(
        action === "save"
          ? `/bill/${created.public_id}/edit`
          : `/bill/${created.public_id}`,
      );
    } catch (err: any) {
      setSaveError(err.message);
      setBusyAction(null);
    }
  };

  const projectOptions = (lookups.projects ?? []).map((p) => ({
    value: p.public_id,
    label: p.abbreviation ? `${p.abbreviation} — ${p.name}` : p.name,
  }));
  const sccOptions = (lookups.sub_cost_codes ?? []).map((s) => ({
    value: String(s.id),
    label: s.number ? `${s.number} — ${s.name}` : s.name,
  }));

  return (
    <div className="page form-page-wide">
      <Breadcrumb crumbs={entityCrumbs("Bills", "/bill/list", "Create")} />
      <div className="page-header"><h1>Create Bill</h1></div>
      <form
        className="detail-card"
        onSubmit={(e) => {
          e.preventDefault();
          // pendingActionRef is set by whichever button initiated the
          // submit. Defaults to "save" so an Enter-key submission from
          // a header field behaves like Save For Later (the safest of
          // the three — no notification, no completion side effects).
          const action = pendingActionRef.current ?? "save";
          pendingActionRef.current = null;
          handleSubmit(action);
        }}
        // If HTML5 validation blocks the submit, clear the pending action
        // so a follow-up Enter-key submission doesn't silently inherit
        // the previous button's intent (e.g. firing Complete after the
        // user fixed a missing field and pressed Enter to retry a Save).
        onInvalid={() => { pendingActionRef.current = null; }}
      >
        {saveError && <div className="form-error">{saveError}</div>}

        {/* Header fields as label-left / input-right rows, matching BillView's
            .detail-row shape. The .detail-fields-form class flips each
            enclosed .form-group (rendered by FormField/SelectField/etc.) to
            a horizontal layout with a thin divider between rows. */}
        <div className="detail-fields-form">
          <SelectField
            label="Vendor"
            name="vendor_public_id"
            value={form.vendor_public_id}
            onChange={onChange}
            options={(lookups.vendors ?? []).map((v) => ({ value: v.public_id, label: v.name }))}
            required
          />
          <FormField label="Bill Number" name="bill_number" value={form.bill_number} onChange={onChange} required />
          <DateField label="Bill Date" name="bill_date" value={form.bill_date} onChange={onChange} required />
          <DateField label="Due Date" name="due_date" value={form.due_date} onChange={onChange} required />
          <SelectField
            label="Payment Term"
            name="payment_term_public_id"
            value={form.payment_term_public_id}
            onChange={onChange}
            options={(lookups.payment_terms ?? []).map((pt) => ({ value: pt.public_id, label: pt.name }))}
          />
          <TextareaField label="Memo" name="memo" value={form.memo} onChange={onChange} />
        </div>

        {/* ─── Line Item Details (optional) ────────────────────────────── */}
        <div className="li-cards-section" style={{ marginTop: 16 }}>
          <div className="inline-li-header">
            <h3 className="line-items-heading">Line Item Details</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>
              Optional — fill in to enable Submit for Review.
            </span>
          </div>
          <table className="data-table line-items-edit-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Sub Cost Code</th>
                <th>Project</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Rate</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ textAlign: "right" }}>Markup</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "center" }}>Billable</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((li, index) => (
                <tr key={index}>
                  <td>
                    <input
                      className="inline-li-input"
                      value={li.description}
                      onChange={(e) => updateLine(index, "description", e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="inline-li-input"
                      value={li.sub_cost_code_id}
                      onChange={(e) => updateLine(index, "sub_cost_code_id", e.target.value)}
                    >
                      <option value="">—</option>
                      {sccOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="inline-li-input"
                      value={li.project_public_id}
                      onChange={(e) => updateLine(index, "project_public_id", e.target.value)}
                    >
                      <option value="">—</option>
                      {projectOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      className="inline-li-input"
                      type="number"
                      step="any"
                      value={li.quantity}
                      onChange={(e) => updateLine(index, "quantity", e.target.value)}
                    />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      className="inline-li-input"
                      type="number"
                      step="any"
                      value={li.rate}
                      onChange={(e) => updateLine(index, "rate", e.target.value)}
                    />
                  </td>
                  <td style={{ textAlign: "right" }} className="inline-li-computed">
                    {fmtMoney(li.amount)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      className="inline-li-input"
                      type="number"
                      step="any"
                      placeholder="0.10"
                      value={li.markup}
                      onChange={(e) => updateLine(index, "markup", e.target.value)}
                    />
                  </td>
                  <td style={{ textAlign: "right" }} className="inline-li-computed">
                    {fmtMoney(li.price)}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={li.is_billable}
                      onChange={(e) => updateLine(index, "is_billable", e.target.checked)}
                    />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="inline-li-remove"
                        onClick={() => removeLine(index)}
                        title="Remove this line"
                        aria-label={`Remove line ${index + 1}`}
                      >
                        &times;
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addLine}
              disabled={busy}
            >
              + Add Line
            </button>
          </div>

          <div style={{ marginTop: 8, textAlign: "right", fontSize: 14 }}>
            Total Amount: <strong>{fmtMoney(String(totalAmount))}</strong>
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/bill/list")}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !file}
            onClick={() => { pendingActionRef.current = "save"; }}
            title="Save the bill as a draft and continue editing on the next page."
          >
            {busyAction === "save" ? "Saving..." : "Save For Later"}
          </button>
          <button
            type="submit"
            className="btn btn-success"
            disabled={busy || !file || !canSubmitForReview}
            onClick={() => { pendingActionRef.current = "submit"; }}
            title={
              canSubmitForReview
                ? "Save the bill AND queue the reviewer notification email."
                : "Set Project on the line item to enable Submit for Review."
            }
          >
            {busyAction === "submit" ? "Submitting..." : "Submit For Review"}
          </button>
          {canCompleteBills && (
            <button
              type="submit"
              className="btn btn-success"
              disabled={busy || !file || !canCompleteFromHere}
              onClick={() => { pendingActionRef.current = "complete"; }}
              title={
                canCompleteFromHere
                  ? "Save the bill AND finalize it directly — bypasses review, kicks off SharePoint / Excel / QBO push."
                  : "Set both Project and Sub Cost Code on the line item to enable Complete."
              }
            >
              {busyAction === "complete" ? "Completing..." : "Complete Bill"}
            </button>
          )}
        </div>

        {/* Attachment section — full-width at the bottom of the card. Actions
            live ABOVE this block so the user doesn't have to page past the
            PDF preview to reach Submit / Complete. */}
        <div className="pdf-viewer">
          <h3 className="line-items-heading">
            Attachment <span style={{ color: "#c00" }}>*</span>
          </h3>
          {previewUrl ? (
            <>
              <iframe
                src={`${previewUrl}#view=FitH&navpanes=0`}
                title="Bill PDF preview"
              />
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                {file?.name} ({file ? Math.round(file.size / 1024) : 0} KB)
                {" · "}
                <button
                  type="button"
                  className="drop-zone-browse"
                  onClick={() => setFile(null)}
                  disabled={busy}
                >
                  Change file
                </button>
              </div>
            </>
          ) : (
            <div
              className={`drop-zone ${dragOver ? "drop-zone-active" : ""}`}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <span className="drop-zone-icon">📄</span>
              <p className="drop-zone-text">Drop the PDF here</p>
              <p className="drop-zone-subtext">
                or{" "}
                <button
                  type="button"
                  className="drop-zone-browse"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  browse files
                </button>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={onFileChange}
                disabled={busy}
              />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
