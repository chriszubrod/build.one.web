import { useState } from "react";
import { ApiError, post, uploadFile } from "../../api/client";
import Sheet from "../../components/ui/Sheet";
import SheetHeader from "../../components/ui/SheetHeader";
import SectionCard from "../../components/ui/SectionCard";
import Field from "../../components/ui/Field";
import { useToast } from "../../components/Toast";
import type {
  CertificateOfInsuranceExtractResult,
  ComplianceCoverageType,
} from "../../types/api";

interface CertificateOfInsuranceSheetProps {
  vendorPublicId: string;
  onClose: () => void;
  onSaved: () => void;
}

type Step = "upload" | "review" | "saving";

const COVERAGE_OPTIONS: { value: ComplianceCoverageType; label: string }[] = [
  { value: "GL", label: "GL" },
  { value: "WC", label: "WC" },
  { value: "OTHER", label: "Other" },
];

interface ReviewPolicyRow {
  coverage_type: ComplianceCoverageType | "";
  carrier: string;
  policy_number: string;
  each_occurrence: string;
  aggregate: string;
  effective_date: string;
  expiry_date: string;
}

function toDateInput(v: string | null | undefined): string {
  if (!v) return "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : v;
}

function blankPolicyRow(): ReviewPolicyRow {
  return {
    coverage_type: "",
    carrier: "",
    policy_number: "",
    each_occurrence: "",
    aggregate: "",
    effective_date: "",
    expiry_date: "",
  };
}

function mapExtractPolicies(
  policies: CertificateOfInsuranceExtractResult["policies"],
): ReviewPolicyRow[] {
  if (policies.length === 0) return [blankPolicyRow()];
  return policies.map((p) => ({
    coverage_type: p.coverage_type,
    carrier: p.carrier ?? "",
    policy_number: p.policy_number ?? "",
    each_occurrence: p.each_occurrence ?? "",
    aggregate: p.aggregate ?? "",
    effective_date: toDateInput(p.effective_date),
    expiry_date: toDateInput(p.expiry_date),
  }));
}

export default function CertificateOfInsuranceSheet({
  vendorPublicId,
  onClose,
  onSaved,
}: CertificateOfInsuranceSheetProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [attachmentPublicId, setAttachmentPublicId] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [reviewRows, setReviewRows] = useState<ReviewPolicyRow[]>([blankPolicyRow()]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0] ?? null;
    if (chosen && chosen.type !== "application/pdf") {
      toast("Only PDF attachments are supported", "error");
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(chosen);
  };

  const handleExtract = async () => {
    if (!file || extracting) return;
    setExtracting(true);
    try {
      const att = await uploadFile<{ public_id: string }>(
        "/api/v1/upload/attachment",
        file,
      );
      const result = await post<CertificateOfInsuranceExtractResult>(
        `/api/v1/vendor/${vendorPublicId}/certificate-of-insurance/extract`,
        { attachment_public_id: att.public_id },
      );
      setAttachmentPublicId(result.attachment_public_id);
      setIssuingAuthority(result.issuing_authority ?? "");
      setIssueDate(toDateInput(result.issue_date));
      setReviewRows(mapExtractPolicies(result.policies));
      setConfidence(result.confidence);
      setUnresolved(result.unresolved ?? []);
      setStep("review");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail : "Could not extract coverages from PDF";
      toast(msg, "error");
    } finally {
      setExtracting(false);
    }
  };

  const updateRow = (index: number, patch: Partial<ReviewPolicyRow>) => {
    setReviewRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const removeRow = (index: number) => {
    setReviewRows((rows) => {
      if (rows.length <= 1) return [blankPolicyRow()];
      return rows.filter((_, i) => i !== index);
    });
  };

  const handleSave = async () => {
    if (step === "saving" || !attachmentPublicId) return;
    setStep("saving");
    try {
      const policies = reviewRows
        .filter((r) => r.coverage_type)
        .map((r) => ({
          coverage_type: r.coverage_type,
          carrier: r.carrier || null,
          policy_number: r.policy_number || null,
          each_occurrence: r.each_occurrence || null,
          aggregate: r.aggregate || null,
          effective_date: r.effective_date || null,
          expiry_date: r.expiry_date || null,
        }));
      await post(`/api/v1/vendor/${vendorPublicId}/certificate-of-insurance/ingest`, {
        attachment_public_id: attachmentPublicId,
        issuing_authority: issuingAuthority || null,
        issue_date: issueDate || null,
        verification_status: "Received",
        policies,
      });
      toast("Certificate of insurance saved", "success");
      onSaved();
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.detail : "Could not save certificate of insurance";
      toast(msg, "error");
      setStep("review");
    }
  };

  const title =
    step === "upload"
      ? "Add certificate of insurance"
      : step === "saving"
        ? "Saving certificate…"
        : "Review certificate";

  return (
    <Sheet
      open
      onDismiss={() => {
        if (step !== "saving") onClose();
      }}
    >
      <SheetHeader
        title={title}
        onCancel={() => {
          if (step !== "saving") onClose();
        }}
      />
      <div className="sheet-body">
        {step === "upload" && (
          <SectionCard>
            <div className="field">
              <label className="field-label">PDF certificate (required)</label>
              <input
                type="file"
                accept="application/pdf"
                disabled={extracting}
                onChange={handleFileChange}
                autoFocus
              />
            </div>
            {extracting ? (
              <p className="vendor-compliance-muted">Extracting coverages…</p>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!file}
                onClick={() => void handleExtract()}
              >
                Extract coverages
              </button>
            )}
          </SectionCard>
        )}

        {step === "review" && (
          <>
            <p className="vendor-compliance-muted">
              {`Drafted from the document — DI confidence ${Math.round(confidence * 100)}%${
                unresolved.length ? `; review: ${unresolved.join(", ")}` : ""
              }. Edit before saving.`}
            </p>
            <SectionCard header="Certificate">
              <Field
                label="Issuing authority"
                value={issuingAuthority}
                onChange={setIssuingAuthority}
                placeholder="Issuing authority"
              />
              <div className="field">
                <label className="field-label">Issue date</label>
                <input
                  className="field-input"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
            </SectionCard>

            <SectionCard header="Coverages">
              {reviewRows.map((row, index) => (
                <div key={index} className="vendor-compliance-coi-review-row">
                  <div className="field">
                    <label className="field-label">Coverage type</label>
                    <select
                      className="form-select"
                      value={row.coverage_type}
                      onChange={(e) =>
                        updateRow(index, {
                          coverage_type: e.target.value as ComplianceCoverageType | "",
                        })
                      }
                    >
                      <option value="">Select coverage…</option>
                      {COVERAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field
                    label="Carrier"
                    value={row.carrier}
                    onChange={(v) => updateRow(index, { carrier: v })}
                    placeholder="Carrier"
                  />
                  <Field
                    label="Policy number"
                    value={row.policy_number}
                    onChange={(v) => updateRow(index, { policy_number: v })}
                    placeholder="Policy number"
                  />
                  <div className="field">
                    <label className="field-label">Each occurrence</label>
                    <input
                      className="field-input"
                      type="number"
                      step="0.01"
                      value={row.each_occurrence}
                      onChange={(e) => updateRow(index, { each_occurrence: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Aggregate</label>
                    <input
                      className="field-input"
                      type="number"
                      step="0.01"
                      value={row.aggregate}
                      onChange={(e) => updateRow(index, { aggregate: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Effective date</label>
                    <input
                      className="field-input"
                      type="date"
                      value={row.effective_date}
                      onChange={(e) => updateRow(index, { effective_date: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">Expiry date</label>
                    <input
                      className="field-input"
                      type="date"
                      value={row.expiry_date}
                      onChange={(e) => updateRow(index, { expiry_date: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => removeRow(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setReviewRows((rows) => [...rows, blankPolicyRow()])}
              >
                Add coverage
              </button>
            </SectionCard>

            <div className="vendor-compliance-coi-review-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setStep("upload")}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void handleSave()}
              >
                Save certificate
              </button>
            </div>
          </>
        )}

        {step === "saving" && (
          <p className="vendor-compliance-muted">Saving certificate of insurance…</p>
        )}
      </div>
    </Sheet>
  );
}
