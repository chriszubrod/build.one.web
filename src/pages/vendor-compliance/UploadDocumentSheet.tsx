import { useState } from "react";
import { ApiError, post, uploadFile } from "../../api/client";
import Sheet from "../../components/ui/Sheet";
import SheetHeader from "../../components/ui/SheetHeader";
import SectionCard from "../../components/ui/SectionCard";
import Field from "../../components/ui/Field";
import { useToast } from "../../components/Toast";
import type { BusinessLicense, ComplianceDocumentType, ContractorsLicense } from "../../types/api";

/** BL/CL ingest only — COI uses the coverage flow (later stage). */
type IngestDocumentType = Extract<
  ComplianceDocumentType,
  "BUSINESS_LICENSE" | "CONTRACTORS_LICENSE"
>;

interface UploadDocumentSheetProps {
  vendorPublicId: string;
  /** When opened from a specific slot, pre-select and lock document type. */
  initialDocumentType?: IngestDocumentType;
  onClose: () => void;
  onSaved: () => void;
}

const DOCUMENT_TYPE_OPTIONS: { value: IngestDocumentType; label: string }[] = [
  { value: "BUSINESS_LICENSE", label: "Business License" },
  { value: "CONTRACTORS_LICENSE", label: "Contractor's License" },
];

export default function UploadDocumentSheet({
  vendorPublicId,
  initialDocumentType,
  onClose,
  onSaved,
}: UploadDocumentSheetProps) {
  const { toast } = useToast();
  const [documentType, setDocumentType] = useState<IngestDocumentType | "">(
    initialDocumentType ?? "",
  );
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [classification, setClassification] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const typeLocked = initialDocumentType != null;
  const canSave = documentType !== "" && file != null;

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

  const handleSave = async () => {
    if (!canSave || saving || !documentType) return;
    if (!file) {
      toast("A PDF attachment is required", "error");
      return;
    }
    setSaving(true);
    try {
      const att = await uploadFile<{ public_id: string }>(
        "/api/v1/upload/attachment",
        file,
      );
      const attachmentPublicId = att.public_id;

      const common = {
        attachment_public_id: attachmentPublicId,
        license_number: documentNumber || null,
        issuing_authority: issuingAuthority || null,
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
      };

      if (documentType === "BUSINESS_LICENSE") {
        await post<BusinessLicense>(
          `/api/v1/vendor/${vendorPublicId}/business-license/ingest`,
          common,
        );
      } else {
        await post<ContractorsLicense>(
          `/api/v1/vendor/${vendorPublicId}/contractors-license/ingest`,
          {
            ...common,
            classification: classification || null,
          },
        );
      }

      toast("Document added", "success");
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not add document";
      toast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onDismiss={onClose}>
      <SheetHeader
        title="Add compliance document"
        onCancel={onClose}
        onSave={handleSave}
        saveDisabled={!canSave || saving}
        saveLabel={saving ? "Saving…" : "Save"}
      />
      <div className="sheet-body">
        <SectionCard>
          <div className="field">
            <label className="field-label">Document type</label>
            <select
              className="form-select"
              value={documentType}
              disabled={typeLocked}
              onChange={(e) => setDocumentType(e.target.value as IngestDocumentType | "")}
              autoFocus={!typeLocked}
            >
              <option value="">Select type…</option>
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <Field
            label="Issuing authority"
            value={issuingAuthority}
            onChange={setIssuingAuthority}
            placeholder="Issuing authority"
          />
          <Field
            label="License number"
            value={documentNumber}
            onChange={setDocumentNumber}
            placeholder="License number"
          />
          {documentType === "CONTRACTORS_LICENSE" && (
            <Field
              label="Classification"
              value={classification}
              onChange={setClassification}
              placeholder="Classification"
            />
          )}
          <div className="field">
            <label className="field-label">Issue date</label>
            <input
              className="field-input"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">Expiry date</label>
            <input
              className="field-input"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">PDF attachment (required)</label>
            <input type="file" accept="application/pdf" onChange={handleFileChange} />
          </div>
        </SectionCard>
      </div>
    </Sheet>
  );
}
