import { useState } from "react";
import { ApiError, post, uploadFile } from "../../api/client";
import Sheet from "../../components/ui/Sheet";
import SheetHeader from "../../components/ui/SheetHeader";
import SectionCard from "../../components/ui/SectionCard";
import Field from "../../components/ui/Field";
import { useToast } from "../../components/Toast";
import type { ComplianceDocumentType, VendorComplianceDocument } from "../../types/api";

interface UploadDocumentSheetProps {
  vendorPublicId: string;
  onClose: () => void;
  onSaved: () => void;
}

const DOCUMENT_TYPE_OPTIONS: { value: ComplianceDocumentType; label: string }[] = [
  { value: "BUSINESS_LICENSE", label: "Business License" },
  { value: "CONTRACTORS_LICENSE", label: "Contractor's License" },
  { value: "CERTIFICATE_OF_INSURANCE", label: "Certificate of Insurance" },
];

export default function UploadDocumentSheet({
  vendorPublicId,
  onClose,
  onSaved,
}: UploadDocumentSheetProps) {
  const { toast } = useToast();
  const [documentType, setDocumentType] = useState<ComplianceDocumentType | "">("");
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [classification, setClassification] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = documentType !== "";

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
    setSaving(true);
    try {
      let attachmentPublicId: string | null = null;
      if (file) {
        const att = await uploadFile<{ public_id: string }>(
          "/api/v1/upload/attachment",
          file,
        );
        attachmentPublicId = att.public_id;
      }

      await post<VendorComplianceDocument>("/api/v1/create/vendor-compliance-document", {
        vendor_public_id: vendorPublicId,
        document_type: documentType,
        issuing_authority: issuingAuthority || null,
        document_number: documentNumber || null,
        classification: classification || null,
        issue_date: issueDate || null,
        expiry_date:
          documentType === "CERTIFICATE_OF_INSURANCE" ? null : expiryDate || null,
        attachment_public_id: attachmentPublicId,
      });

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
              onChange={(e) => setDocumentType(e.target.value as ComplianceDocumentType | "")}
              autoFocus
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
            label="Document number"
            value={documentNumber}
            onChange={setDocumentNumber}
            placeholder="Document number"
          />
          <Field
            label="Classification"
            value={classification}
            onChange={setClassification}
            placeholder="Classification"
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
          {documentType !== "CERTIFICATE_OF_INSURANCE" && (
            <div className="field">
              <label className="field-label">Expiry date</label>
              <input
                className="field-input"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label className="field-label">PDF attachment (optional)</label>
            <input type="file" accept="application/pdf" onChange={handleFileChange} />
          </div>
        </SectionCard>
      </div>
    </Sheet>
  );
}
