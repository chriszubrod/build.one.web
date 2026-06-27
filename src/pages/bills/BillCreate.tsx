import { useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { post, uploadFile } from "../../api/client";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import { Modules } from "../../shared/modules";
import { computeBillLine } from "./lineMath";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import type { Bill } from "../../types/api";

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
  const canCompleteBills =
    !!me &&
    (me.is_admin ||
      !!me.modules?.find((m) => m.name === Modules.BILLS)?.can_complete);
  const [form, setForm] = useState({
    vendor_public_id: "",
    payment_term_public_id: "",
    bill_date: "",
    due_date: "",
    bill_number: "",
    memo: "",
  });
  const [line, setLine] = useState<LineItemDraft>(EMPTY_LINE);
  const [file, setFile] = useState<File | null>(null);
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

  const onChange = (name: string, value: string) =>
    setForm((prev) => ({ ...prev, [name]: value }));

  const updateLine = (key: keyof LineItemDraft, value: string | boolean) => {
    setLine((prev) => computeBillLine({ ...prev, [key]: value } as LineItemDraft));
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.type !== "application/pdf") {
      setSaveError("Only PDF files are allowed.");
      setFile(null);
      e.target.value = "";
      return;
    }
    setSaveError("");
    setFile(f);
  };

  // Only include `line_*` fields in the POST body when the user has
  // actually filled the card in. Otherwise let the server create a bare
  // placeholder line item (today's behaviour for empty creates).
  const hasLineData =
    line.project_public_id !== "" ||
    line.sub_cost_code_id !== "" ||
    line.description !== "" ||
    line.rate !== "";

  // Submit For Review needs a project on the line item so the API's
  // recipient resolver can find PMs/Owners. Without it the notification
  // would queue empty (the K06988 bug). Tooltip explains.
  const canSubmitForReview = !!line.project_public_id;
  // Complete needs both project + SCC because the post-complete outbox
  // pushes the line to SharePoint (per-project folder), the project's
  // Excel workbook (per-SCC section), and QBO (line.item maps via SCC).
  // Missing either → dead-letter rows; gate to prevent.
  const canCompleteFromHere = !!line.project_public_id && !!line.sub_cost_code_id;

  const buildBody = (submitForReview: boolean) => {
    const body: Record<string, unknown> = {
      vendor_public_id: form.vendor_public_id,
      payment_term_public_id: form.payment_term_public_id || null,
      bill_date: form.bill_date,
      due_date: form.due_date,
      bill_number: form.bill_number,
      // TotalAmount is the sum of line.amount values (one line here).
      total_amount: hasLineData ? Number(line.amount || 0) : null,
      memo: form.memo || null,
      is_draft: true,
      submit_for_review: submitForReview,
    };
    if (hasLineData) {
      body.line_description = line.description || null;
      body.line_quantity = line.quantity !== "" ? Number(line.quantity) : null;
      body.line_rate = line.rate !== "" ? Number(line.rate) : null;
      body.line_amount = line.amount !== "" ? Number(line.amount) : null;
      body.line_markup = line.markup !== "" ? Number(line.markup) : null;
      body.line_price = line.price !== "" ? Number(line.price) : null;
      body.line_is_billable = line.is_billable;
      body.line_sub_cost_code_id =
        line.sub_cost_code_id !== "" ? Number(line.sub_cost_code_id) : null;
      body.line_project_public_id = line.project_public_id || null;
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
      <div className="page-header"><h1>Create Bill</h1></div>
      <form
        className="form-card"
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

        <div className="form-header-grid">
          <FormField label="Bill Number" name="bill_number" value={form.bill_number} onChange={onChange} required />
          <SelectField
            label="Vendor"
            name="vendor_public_id"
            value={form.vendor_public_id}
            onChange={onChange}
            options={(lookups.vendors ?? []).map((v) => ({ value: v.public_id, label: v.name }))}
            required
          />
          <DateField label="Bill Date" name="bill_date" value={form.bill_date} onChange={onChange} required />
          <DateField label="Due Date" name="due_date" value={form.due_date} onChange={onChange} required />
          <SelectField
            label="Payment Term"
            name="payment_term_public_id"
            value={form.payment_term_public_id}
            onChange={onChange}
            options={(lookups.payment_terms ?? []).map((pt) => ({ value: pt.public_id, label: pt.name }))}
          />
          <div className="full-width">
            <TextareaField label="Memo" name="memo" value={form.memo} onChange={onChange} />
          </div>
          <div className="full-width">
            <div className="form-group">
              <label>
                PDF Attachment <span style={{ color: "#c00" }}>*</span>
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={onFileChange}
                required
                disabled={busy}
              />
              {file && (
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Selected: {file.name} ({Math.round(file.size / 1024)} KB)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Line Item Details (optional) ────────────────────────────── */}
        <div className="li-cards-section" style={{ marginTop: 16 }}>
          <div className="inline-li-header">
            <h3 className="line-items-heading">Line Item Details</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>
              Optional — fill in to enable Submit for Review.
            </span>
          </div>
          <div className="li-card">
            <div className="li-card-row">
              <div className="li-card-field" style={{ flex: 2 }}>
                <label>Project</label>
                <select
                  className="inline-li-input"
                  value={line.project_public_id}
                  onChange={(e) => updateLine("project_public_id", e.target.value)}
                >
                  <option value="">—</option>
                  {projectOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="li-card-field" style={{ flex: 2 }}>
                <label>Sub Cost Code</label>
                <select
                  className="inline-li-input"
                  value={line.sub_cost_code_id}
                  onChange={(e) => updateLine("sub_cost_code_id", e.target.value)}
                >
                  <option value="">—</option>
                  {sccOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="li-card-field" style={{ flex: 2 }}>
                <label>Description</label>
                <input
                  className="inline-li-input"
                  value={line.description}
                  onChange={(e) => updateLine("description", e.target.value)}
                />
              </div>
            </div>

            <div className="li-card-row">
              <div className="li-card-field">
                <label>Qty</label>
                <input
                  className="inline-li-input"
                  type="number"
                  step="any"
                  value={line.quantity}
                  onChange={(e) => updateLine("quantity", e.target.value)}
                />
              </div>
              <div className="li-card-field">
                <label>Rate</label>
                <input
                  className="inline-li-input"
                  type="number"
                  step="any"
                  value={line.rate}
                  onChange={(e) => updateLine("rate", e.target.value)}
                />
              </div>
              <div className="li-card-field">
                <label>Amount</label>
                <span className="inline-li-computed">{fmtMoney(line.amount)}</span>
              </div>
              <div className="li-card-field">
                <label className="li-card-checkbox-label">
                  <input
                    type="checkbox"
                    checked={line.is_billable}
                    onChange={(e) => updateLine("is_billable", e.target.checked)}
                  />
                  Billable
                </label>
              </div>
              <div className="li-card-field">
                <label>Markup</label>
                <input
                  className="inline-li-input"
                  type="number"
                  step="any"
                  placeholder="0.10"
                  value={line.markup}
                  onChange={(e) => updateLine("markup", e.target.value)}
                />
              </div>
              <div className="li-card-field">
                <label>Price</label>
                <span className="inline-li-computed">{fmtMoney(line.price)}</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 8, textAlign: "right", fontSize: 14 }}>
            Total Amount: <strong>{fmtMoney(line.amount)}</strong>
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
      </form>
    </div>
  );
}
