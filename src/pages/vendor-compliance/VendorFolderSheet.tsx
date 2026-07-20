import { useCallback, useEffect, useState } from "react";
import { Folder } from "lucide-react";
import { ApiError, del, getList, getOne, post } from "../../api/client";
import Sheet from "../../components/ui/Sheet";
import SheetHeader from "../../components/ui/SheetHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import Field from "../../components/ui/Field";
import { useToast } from "../../components/Toast";
import type {
  ComplianceDocumentType,
  VendorComplianceDocument,
  VendorFolderBrowseItem,
  VendorFolderDrive,
  VendorFolderFile,
  VendorFolderLinkedFolder,
} from "../../types/api";
import {
  folderFileShowsComplianceHint,
  folderFileSubtitle,
  IMPORT_DOCUMENT_TYPE_OPTIONS,
} from "./vendorFolderLogic";

type SheetMode = "status" | "picker" | "import";
type PickerView = "drives" | "browse";

interface NavEntry {
  item_id: string | null;
  name: string;
}

interface VendorFolderSheetProps {
  vendorPublicId: string;
  vendorName: string;
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
}

function browseUrl(drivePublicId: string, itemId: string | null): string {
  const params = new URLSearchParams({ drive_public_id: drivePublicId });
  if (itemId) params.set("item_id", itemId);
  return `/api/v1/vendor-compliance/folder/browse?${params}`;
}

export default function VendorFolderSheet({
  vendorPublicId,
  vendorName,
  isOpen,
  onClose,
  onChanged,
}: VendorFolderSheetProps) {
  const { toast } = useToast();
  const basePath = `/api/v1/vendor-compliance/${vendorPublicId}/folder`;

  const [mode, setMode] = useState<SheetMode>("status");
  const [linked, setLinked] = useState<VendorFolderLinkedFolder | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Picker state
  const [pickerView, setPickerView] = useState<PickerView>("drives");
  const [drives, setDrives] = useState<VendorFolderDrive[]>([]);
  const [selectedDrivePublicId, setSelectedDrivePublicId] = useState<string | null>(null);
  const [navStack, setNavStack] = useState<NavEntry[]>([]);
  const [browseItems, setBrowseItems] = useState<VendorFolderBrowseItem[]>([]);

  // Import state
  const [folderFiles, setFolderFiles] = useState<VendorFolderFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<ComplianceDocumentType | "">("");
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [classification, setClassification] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const resetPickerState = useCallback(() => {
    setPickerView("drives");
    setSelectedDrivePublicId(null);
    setNavStack([]);
    setBrowseItems([]);
    setDrives([]);
  }, []);

  const resetImportState = useCallback(() => {
    setFolderFiles([]);
    setSelectedFileId(null);
    setDocumentType("");
    setIssuingAuthority("");
    setDocumentNumber("");
    setClassification("");
    setIssueDate("");
    setExpiryDate("");
  }, []);

  const loadLinkedFolder = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getOne<VendorFolderLinkedFolder | null>(basePath);
      setLinked(data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not load folder link";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    if (!isOpen) return;
    setMode("status");
    resetPickerState();
    resetImportState();
    setError("");
    void loadLinkedFolder();
  }, [isOpen, vendorPublicId, loadLinkedFolder, resetPickerState, resetImportState]);

  const loadDrives = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getList<VendorFolderDrive>("/api/v1/vendor-compliance/folder/drives");
      setDrives(res.data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not load drives";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadBrowseItems = async (drivePublicId: string, itemId: string | null) => {
    setLoading(true);
    setError("");
    setBrowseItems([]); // clear stale rows so a failed browse can't render old rows under a new path
    try {
      const res = await getList<VendorFolderBrowseItem>(browseUrl(drivePublicId, itemId));
      setBrowseItems(res.data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not browse folder";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadFolderFiles = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getList<VendorFolderFile>(`${basePath}/files`);
      setFolderFiles(res.data);
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not load folder files";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const enterPickerMode = () => {
    setMode("picker");
    resetPickerState();
    void loadDrives();
  };

  const enterImportMode = () => {
    setMode("import");
    resetImportState();
    void loadFolderFiles();
  };

  const handleCancel = () => {
    if (mode === "status") {
      onClose();
      return;
    }
    setMode("status");
    resetPickerState();
    resetImportState();
    setError("");
  };

  const handleSelectDrive = (drive: VendorFolderDrive) => {
    setSelectedDrivePublicId(drive.drive_public_id);
    setPickerView("browse");
    setNavStack([{ item_id: null, name: drive.name }]);
    void loadBrowseItems(drive.drive_public_id, null);
  };

  const handleBrowseFolder = (item: VendorFolderBrowseItem) => {
    if (!selectedDrivePublicId) return;
    setNavStack((prev) => [...prev, { item_id: item.item_id, name: item.name }]);
    void loadBrowseItems(selectedDrivePublicId, item.item_id);
  };

  const handlePickerBack = () => {
    if (pickerView === "browse" && navStack.length <= 1) {
      setPickerView("drives");
      setSelectedDrivePublicId(null);
      setNavStack([]);
      setBrowseItems([]);
      return;
    }

    const newStack = navStack.slice(0, -1);
    setNavStack(newStack);
    if (!selectedDrivePublicId) return;
    const parent = newStack[newStack.length - 1];
    void loadBrowseItems(selectedDrivePublicId, parent?.item_id ?? null);
  };

  const handleLinkFolder = async (graphItemId: string) => {
    if (!selectedDrivePublicId || saving) return;
    setSaving(true);
    setError("");
    try {
      await post(`${basePath}/link`, {
        drive_public_id: selectedDrivePublicId,
        graph_item_id: graphItemId,
      });
      toast("SharePoint folder linked", "success");
      await loadLinkedFolder();
      onChanged();
      setMode("status");
      resetPickerState();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not link folder";
      toast(msg, "error");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (saving) return;
    if (!window.confirm("Unlink this SharePoint folder from the vendor?")) return;
    setSaving(true);
    setError("");
    try {
      await del(basePath);
      toast("SharePoint folder unlinked", "success");
      setLinked(null);
      onChanged();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not unlink folder";
      toast(msg, "error");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    if (saving || !selectedFileId || !documentType) return;
    setSaving(true);
    setError("");
    try {
      await post<VendorComplianceDocument>(`${basePath}/import`, {
        graph_item_id: selectedFileId,
        document_type: documentType,
        issuing_authority: issuingAuthority || null,
        document_number: documentNumber || null,
        classification: classification || null,
        issue_date: issueDate || null,
        expiry_date:
          documentType === "CERTIFICATE_OF_INSURANCE" ? null : expiryDate || null,
      });
      toast("Document imported", "success");
      onChanged();
      setMode("status");
      resetImportState();
    } catch (err) {
      const msg = err instanceof ApiError ? err.detail : "Could not import document";
      toast(msg, "error");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const linkedLabel = linked?.name ?? linked?.web_url ?? "Linked folder";
  const currentFolder = navStack[navStack.length - 1];
  const canImport = Boolean(selectedFileId && documentType);

  const headerTitle =
    mode === "picker"
      ? "Link SharePoint folder"
      : mode === "import"
        ? "Import from folder"
        : `SharePoint — ${vendorName}`;

  const headerSave =
    mode === "import"
      ? {
          onSave: handleImport,
          saveDisabled: !canImport || saving,
          saveLabel: saving ? "Importing…" : "Import",
        }
      : {};

  return (
    <Sheet open={isOpen} onDismiss={handleCancel}>
      <SheetHeader title={headerTitle} onCancel={handleCancel} {...headerSave} />
      <div className="sheet-body">
        {error && <p className="page-error">{error}</p>}
        {loading && mode === "status" && <p className="vendor-compliance-muted">Loading…</p>}

        {mode === "status" && !loading && (
          <SectionCard>
            {linked ? (
              <>
                <p className="vendor-folder-linked-name">
                  <Folder size={16} aria-hidden />
                  {linked.web_url ? (
                    <a href={linked.web_url} target="_blank" rel="noopener noreferrer">
                      {linkedLabel}
                    </a>
                  ) : (
                    linkedLabel
                  )}
                </p>
                <div className="vendor-folder-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={saving}
                    onClick={enterImportMode}
                  >
                    Import from folder
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={saving}
                    onClick={enterPickerMode}
                  >
                    Change folder
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={saving}
                    onClick={() => void handleUnlink()}
                  >
                    {saving ? "Saving…" : "Unlink"}
                  </button>
                </div>
              </>
            ) : (
              <div className="vendor-folder-empty">
                <p className="vendor-compliance-muted">No SharePoint folder linked</p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={enterPickerMode}
                >
                  Link a folder
                </button>
              </div>
            )}
          </SectionCard>
        )}

        {mode === "picker" && (
          <>
            {pickerView === "browse" && (
              <div className="vendor-folder-picker-nav">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handlePickerBack}
                  disabled={loading || saving}
                >
                  ← Back
                </button>
                <span className="vendor-folder-picker-path">
                  {navStack.map((n) => n.name).join(" / ")}
                </span>
              </div>
            )}

            {loading && <p className="vendor-compliance-muted">Loading…</p>}

            {!loading && pickerView === "drives" && (
              <SectionCard>
                {drives.length === 0 ? (
                  <p className="vendor-compliance-muted">No drives available.</p>
                ) : (
                  drives.map((drive) => (
                    <ListRow
                      key={drive.drive_public_id}
                      title={drive.name}
                      trailing="chevron"
                      onClick={() => handleSelectDrive(drive)}
                    />
                  ))
                )}
              </SectionCard>
            )}

            {!loading && pickerView === "browse" && (
              <SectionCard>
                {currentFolder?.item_id && (
                  <div className="vendor-folder-link-current">
                    <span>Current folder: {currentFolder.name}</span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={saving}
                      onClick={() => void handleLinkFolder(currentFolder.item_id!)}
                    >
                      Link this folder
                    </button>
                  </div>
                )}

                {browseItems.length === 0 ? (
                  <p className="vendor-compliance-muted">No items in this location.</p>
                ) : (
                  browseItems.map((item) => {
                    if (item.item_type === "folder") {
                      return (
                        <div key={item.item_id} className="vendor-folder-browse-row">
                          <ListRow
                            title={item.name}
                            subtitle={
                              item.child_count != null
                                ? `${item.child_count} item${item.child_count === 1 ? "" : "s"}`
                                : undefined
                            }
                            trailing="chevron"
                            onClick={() => handleBrowseFolder(item)}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={saving}
                            onClick={() => void handleLinkFolder(item.item_id)}
                          >
                            Link
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div key={item.item_id} className="vendor-folder-file-muted">
                        <ListRow
                          title={item.name}
                          subtitle="File"
                          trailing="none"
                        />
                      </div>
                    );
                  })
                )}
              </SectionCard>
            )}
          </>
        )}

        {mode === "import" && (
          <>
            {loading && <p className="vendor-compliance-muted">Loading…</p>}
            {!loading && (
              <>
                <SectionCard>
                  {folderFiles.length === 0 ? (
                    <p className="vendor-compliance-muted">No files found in linked folder.</p>
                  ) : (
                    folderFiles.map((file) => (
                      <div key={file.graph_item_id} className="vendor-folder-file-row">
                        <ListRow
                          title={file.name}
                          subtitle={folderFileSubtitle(file)}
                          selected={selectedFileId === file.graph_item_id}
                          onClick={() => setSelectedFileId(file.graph_item_id)}
                        />
                        {folderFileShowsComplianceHint(file) && (
                          <span className="compliance-badge compliance-badge--expiring">
                            Likely compliance
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </SectionCard>

                <SectionCard>
                  <div className="field">
                    <label className="field-label">Document type</label>
                    <select
                      className="form-select"
                      value={documentType}
                      onChange={(e) =>
                        setDocumentType(e.target.value as ComplianceDocumentType | "")
                      }
                    >
                      <option value="">Select type…</option>
                      {IMPORT_DOCUMENT_TYPE_OPTIONS.map((opt) => (
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
                </SectionCard>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
