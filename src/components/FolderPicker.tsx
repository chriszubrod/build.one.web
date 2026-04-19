import { useState, useCallback, useEffect } from "react";
import { rawRequest } from "../api/client";

interface DriveInfo {
  public_id: string;
  name: string;
  drive_type: string;
}

interface BrowseItem {
  item_id: string;
  name: string;
  item_type: "file" | "folder";
  child_count?: number;
  mime_type?: string;
}

interface FolderPickerProps {
  open: boolean;
  mode: "project" | "module" | "excel";
  drives: DriveInfo[];
  rootItemId?: string | null;
  rootDrivePublicId?: string | null;
  moduleName?: string;
  onSelect: (graphItemId: string, drivePublicId: string, worksheetName?: string) => void;
  onClose: () => void;
}

type ViewState = "drives" | "folders" | "worksheets";

export default function FolderPicker({
  open,
  mode,
  drives,
  rootItemId,
  rootDrivePublicId,
  moduleName,
  onSelect,
  onClose,
}: FolderPickerProps) {
  const [view, setView] = useState<ViewState>("drives");
  const [selectedDrive, setSelectedDrive] = useState<string | null>(null);
  const [navStack, setNavStack] = useState<{ item_id: string | null; name: string }[]>([]);
  const [items, setItems] = useState<BrowseItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Worksheet selection state
  const [worksheets, setWorksheets] = useState<{ name: string }[]>([]);
  const [selectedExcelItemId, setSelectedExcelItemId] = useState<string | null>(null);
  const [selectedExcelDrive, setSelectedExcelDrive] = useState<string | null>(null);
  const [selectedExcelName, setSelectedExcelName] = useState("");

  // Reset state when opening
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setError("");
    setWorksheets([]);
    setSelectedExcelItemId(null);

    if (mode === "module" && rootItemId && rootDrivePublicId) {
      // Start from project root folder
      setView("folders");
      setSelectedDrive(rootDrivePublicId);
      setNavStack([{ item_id: rootItemId, name: "Project Root" }]);
      browseFolderItems(rootDrivePublicId, rootItemId);
    } else {
      // Start from drive list
      setView("drives");
      setSelectedDrive(null);
      setNavStack([]);
      setItems([]);
    }
  }, [open, mode, rootItemId, rootDrivePublicId]);

  const browseFolderItems = useCallback(async (drivePublicId: string, itemId: string | null) => {
    setLoading(true);
    setError("");
    try {
      const url = itemId
        ? `/api/v1/ms/sharepoint/driveitem/drive/${drivePublicId}/browse/${itemId}`
        : `/api/v1/ms/sharepoint/driveitem/drive/${drivePublicId}/browse`;
      const data = await rawRequest<any>(url);
      if (data.status_code === 200) {
        const allItems: BrowseItem[] = data.items || [];
        if (mode === "excel") {
          setItems(allItems);
        } else {
          setItems(allItems.filter((i: BrowseItem) => i.item_type === "folder"));
        }
      } else {
        setError(data.message || "Error loading items");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  const handleSelectDrive = (drive: DriveInfo) => {
    setSelectedDrive(drive.public_id);
    setView("folders");
    setNavStack([{ item_id: null, name: drive.name }]);
    setSearch("");
    browseFolderItems(drive.public_id, null);
  };

  const handleBrowseFolder = (item: BrowseItem) => {
    setNavStack((prev) => [...prev, { item_id: item.item_id, name: item.name }]);
    setSearch("");
    const driveId = mode === "module" ? rootDrivePublicId! : selectedDrive!;
    browseFolderItems(driveId, item.item_id);
  };

  const handleBack = () => {
    if (view === "worksheets") {
      setView("folders");
      setWorksheets([]);
      const driveId = mode === "module" ? rootDrivePublicId! : selectedDrive!;
      const current = navStack[navStack.length - 1];
      browseFolderItems(driveId, current?.item_id ?? null);
      return;
    }

    if (navStack.length <= 1) {
      if (mode === "module") {
        onClose();
      } else {
        setView("drives");
        setSelectedDrive(null);
        setNavStack([]);
        setItems([]);
        setSearch("");
      }
      return;
    }

    const newStack = navStack.slice(0, -1);
    setNavStack(newStack);
    setSearch("");
    const parent = newStack[newStack.length - 1];
    const driveId = mode === "module" ? rootDrivePublicId! : selectedDrive!;
    browseFolderItems(driveId, parent.item_id);
  };

  const handleLinkCurrent = () => {
    const current = navStack[navStack.length - 1];
    if (!current?.item_id) return;
    const driveId = mode === "module" ? rootDrivePublicId! : selectedDrive!;
    onSelect(current.item_id, driveId);
  };

  const handleSelectExcel = async (item: BrowseItem) => {
    const driveId = selectedDrive!;
    setSelectedExcelItemId(item.item_id);
    setSelectedExcelDrive(driveId);
    setSelectedExcelName(item.name);
    setView("worksheets");
    setLoading(true);
    setError("");

    try {
      const data = await rawRequest<any>(
        `/api/v1/ms/sharepoint/driveitem/drive/${driveId}/item/${item.item_id}/worksheets`
      );
      if (data.status_code === 200) {
        setWorksheets(data.worksheets || []);
      } else {
        setError(data.message || "Error loading worksheets");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWorksheet = (wsName: string) => {
    if (selectedExcelItemId && selectedExcelDrive) {
      onSelect(selectedExcelItemId, selectedExcelDrive, wsName);
    }
  };

  if (!open) return null;

  // Filter items by search
  const q = search.toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;

  const pathDisplay = navStack.map((n) => n.name).join(" / ");

  const title =
    view === "worksheets" ? "Select Worksheet" :
    view === "drives" ? "Select Drive" :
    mode === "excel" ? "Select Excel Workbook" :
    mode === "module" ? `Select ${moduleName} Folder` :
    "Select Folder";

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-panel" onClick={(e) => e.stopPropagation()}>
        <div className="picker-header">
          <h3>{title}</h3>
          <button type="button" className="picker-close" onClick={onClose}>&times;</button>
        </div>

        {/* Search */}
        {view !== "worksheets" && (
          <div className="picker-search">
            <input
              type="text"
              className="table-search-input"
              placeholder={view === "drives" ? "Filter drives..." : "Filter..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        )}

        {/* Navigation */}
        {view === "folders" && (
          <div className="picker-nav">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleBack}>
              &larr; Back
            </button>
            <span className="picker-path">{pathDisplay}</span>
          </div>
        )}
        {view === "worksheets" && (
          <div className="picker-nav">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleBack}>
              &larr; Back
            </button>
            <span className="picker-path">{selectedExcelName}</span>
          </div>
        )}

        {/* Content */}
        <div className="picker-body">
          {loading && <p className="text-muted">Loading...</p>}
          {error && <p className="page-error">{error}</p>}

          {/* Drive list */}
          {!loading && view === "drives" && (
            <ul className="picker-list">
              {(q ? drives.filter((d) => d.name.toLowerCase().includes(q)) : drives).map((drive) => (
                <li key={drive.public_id} className="picker-item">
                  <div>
                    <div className="picker-item-name">{drive.name}</div>
                    <div className="picker-item-detail">{drive.drive_type}</div>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => handleSelectDrive(drive)}>
                    Browse
                  </button>
                </li>
              ))}
              {drives.length === 0 && <p className="text-muted">No linked drives available.</p>}
            </ul>
          )}

          {/* Folder/file list */}
          {!loading && view === "folders" && (
            <>
              {/* Link current folder option */}
              {mode !== "excel" && navStack.length > 0 && navStack[navStack.length - 1].item_id && (
                <div className="picker-link-current">
                  <strong>Current folder:</strong> {navStack[navStack.length - 1].name}
                  <button type="button" className="btn btn-success btn-sm" style={{ marginLeft: 12 }} onClick={handleLinkCurrent}>
                    Link This Folder
                  </button>
                </div>
              )}

              <ul className="picker-list">
                {filtered.map((item) => {
                  if (mode === "excel" && item.item_type === "file") {
                    const isExcel = (item.mime_type || "").includes("spreadsheetml") || (item.mime_type || "").includes("ms-excel");
                    if (!isExcel) return null;
                    return (
                      <li key={item.item_id} className="picker-item">
                        <div>
                          <div className="picker-item-name">📊 {item.name}</div>
                          <div className="picker-item-detail">Excel Workbook</div>
                        </div>
                        <button type="button" className="btn btn-success btn-sm" onClick={() => handleSelectExcel(item)}>
                          Select
                        </button>
                      </li>
                    );
                  }

                  if (item.item_type === "folder") {
                    return (
                      <li key={item.item_id} className="picker-item">
                        <div>
                          <div className="picker-item-name">📁 {item.name}</div>
                          <div className="picker-item-detail">{item.child_count ?? 0} items</div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleBrowseFolder(item)}>
                            Open
                          </button>
                          {mode !== "excel" && (
                            <button type="button" className="btn btn-success btn-sm" onClick={() => {
                              const driveId = mode === "module" ? rootDrivePublicId! : selectedDrive!;
                              onSelect(item.item_id, driveId);
                            }}>
                              Link
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  }

                  return null;
                })}
                {filtered.length === 0 && !loading && (
                  <p className="text-muted">
                    {mode === "excel" ? "No Excel workbooks or folders found." : "No subfolders in this location."}
                  </p>
                )}
              </ul>
            </>
          )}

          {/* Worksheet list */}
          {!loading && view === "worksheets" && (
            <ul className="picker-list">
              {worksheets.map((ws) => (
                <li key={ws.name} className="picker-item">
                  <div>
                    <div className="picker-item-name">📄 {ws.name}</div>
                    <div className="picker-item-detail">Worksheet</div>
                  </div>
                  <button type="button" className="btn btn-success btn-sm" onClick={() => handleSelectWorksheet(ws.name)}>
                    Select
                  </button>
                </li>
              ))}
              {worksheets.length === 0 && <p className="text-muted">No worksheets found.</p>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
