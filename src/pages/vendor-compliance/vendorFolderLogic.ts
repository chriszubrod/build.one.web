import type { ComplianceDocumentType, VendorFolderFile } from "../../types/api";

/** Document types available when importing from a SharePoint folder (no W-9). */
export const IMPORT_DOCUMENT_TYPE_OPTIONS: {
  value: ComplianceDocumentType;
  label: string;
}[] = [
  { value: "BUSINESS_LICENSE", label: "Business License" },
  { value: "CONTRACTORS_LICENSE", label: "Contractor's License" },
  { value: "CERTIFICATE_OF_INSURANCE", label: "Certificate of Insurance" },
];

export function importDocumentTypeCodes(): ComplianceDocumentType[] {
  return IMPORT_DOCUMENT_TYPE_OPTIONS.map((opt) => opt.value);
}

export function folderFileSubtitle(file: VendorFolderFile): string | undefined {
  if (file.folder_path) return file.folder_path;
  return undefined;
}

export function folderFileShowsComplianceHint(file: VendorFolderFile): boolean {
  return file.compliance_hint === true;
}
