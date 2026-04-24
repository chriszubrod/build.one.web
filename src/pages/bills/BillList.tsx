import { useState, useCallback, useEffect, useRef, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { usePaginatedList } from "../../hooks/usePaginatedList";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import { uploadFile, getOne, rawRequest } from "../../api/client";
import Pagination from "../../components/Pagination";
import PageHeader from "../../components/PageHeader";
import type { Bill, Vendor } from "../../types/api";

interface FolderSummary {
  is_linked: boolean;
  folder_name?: string;
  folder_web_url?: string;
  file_count?: number;
}

function fmtMoney(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PendingFile {
  file: File;
  uploading: boolean;
  error: string;
}

const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"];

export default function BillList() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [statusFilter, setStatusFilter] = useState("draft");
  const [sortKey, setSortKey] = useState<string | null>(() => {
    try { return sessionStorage.getItem("buildOne.billList.sortKey") || null; } catch { return null; }
  });
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    try { return (sessionStorage.getItem("buildOne.billList.sortDir") as "asc" | "desc") || "asc"; } catch { return "asc"; }
  });

  const handleSort = (key: string) => {
    let newDir: "asc" | "desc";
    if (sortKey === key) {
      newDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      newDir = "asc";
    }
    setSortKey(key);
    setSortDir(newDir);
    try {
      sessionStorage.setItem("buildOne.billList.sortKey", key);
      sessionStorage.setItem("buildOne.billList.sortDir", newDir);
    } catch { /* ignore */ }
  };
  const [folderSummary, setFolderSummary] = useState<FolderSummary | null>(null);
  const [processingFolder, setProcessingFolder] = useState(false);
  const [folderProgress, setFolderProgress] = useState<{ total: number; done: number; currentFile: string | null } | null>(null);

  const refreshFolderSummary = useCallback(() => {
    getOne<FolderSummary>("/api/v1/get/bill-folder-summary")
      .then((data) => setFolderSummary(data))
      .catch(() => setFolderSummary(null));
  }, []);

  useEffect(() => { refreshFolderSummary(); }, [refreshFolderSummary]);

  const handleProcessFolder = async () => {
    setProcessingFolder(true);
    setFolderProgress(null);
    try {
      const { run_id } = await rawRequest<{ status: string; run_id: string; files_queued: number }>(
        "/api/v1/process/bill-folder",
        { method: "POST" },
      );

      const poll = async () => {
        const data = await rawRequest<{
          status: string;
          files_total?: number;
          files_processed?: number;
          files_skipped?: number;
          files_failed?: number;
          files_queued?: number;
          current_file?: string | null;
          errors?: string[];
        }>(`/api/v1/process/bill-folder/${run_id}`);

        setFolderProgress({
          total: data.files_total ?? 0,
          done: (data.files_processed ?? 0) + (data.files_skipped ?? 0) + (data.files_failed ?? 0),
          currentFile: data.current_file ?? null,
        });

        if (data.status === "processing" || data.status === "queued") {
          setTimeout(poll, 2000);
        } else {
          setProcessingFolder(false);
          setFolderProgress(null);
          refreshFolderSummary();
          reload();
        }
      };
      setTimeout(poll, 2000);
    } catch {
      setProcessingFolder(false);
      setFolderProgress(null);
    }
  };

  const extraParams = statusFilter ? `?is_draft=${statusFilter === "draft"}` : "";
  const {
    items, total, page, pageSize, totalPages,
    loading, error, setPage, setSearch, search, reload,
  } = usePaginatedList<Bill>(`/api/v1/get/bills${extraParams}`, 50, {
    staleWhileRevalidate: true,
    sessionPersistenceKey: "buildOne.billList",
  });
  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);
  const projectMap = useIdNameMap<{ id: number; name: string }>("/api/v1/get/projects", (p) => p.name);

  // Resolve display values for sorting
  const resolvedItems = items.map((bill) => ({
    ...bill,
    _vendor: vendorMap.get(bill.vendor_id) ?? "",
    _project: projectMap.get((bill as any).project_id) ?? "",
    _date: bill.bill_date ?? "",
    _amount: bill.total_amount ? Number(bill.total_amount) : 0,
  }));

  const sortedItems = sortKey
    ? [...resolvedItems].sort((a, b) => {
        const av = (a as any)[sortKey];
        const bv = (b as any)[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const aStr = String(av);
        const bStr = String(bv);
        const aNum = Number(aStr);
        const bNum = Number(bStr);
        let cmp: number;
        if (!isNaN(aNum) && !isNaN(bNum)) {
          cmp = aNum - bNum;
        } else {
          cmp = aStr.localeCompare(bStr, undefined, { sensitivity: "base" });
        }
        return sortDir === "asc" ? cmp : -cmp;
      })
    : resolvedItems;

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles: PendingFile[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) continue;
      const alreadyAdded = pendingFiles.some(
        (p) => p.file.name === file.name && p.file.size === file.size,
      );
      if (!alreadyAdded) {
        newFiles.push({ file, uploading: false, error: "" });
      }
    }
    if (newFiles.length > 0) {
      setPendingFiles((prev) => [...prev, ...newFiles]);
    }
  }, [pendingFiles]);

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllFiles = () => setPendingFiles([]);

  const createBillFromFile = async (index: number) => {
    const entry = pendingFiles[index];
    if (!entry || entry.uploading) return;

    setPendingFiles((prev) =>
      prev.map((p, i) => (i === index ? { ...p, uploading: true, error: "" } : p)),
    );

    try {
      const result = await uploadFile<{ token: string }>(
        "/api/v1/temp/pending-bill-file",
        entry.file,
      );
      setPendingFiles((prev) => prev.filter((_, i) => i !== index));
      navigate(`/bill/create?pendingFileToken=${encodeURIComponent(result.token)}`);
    } catch (err: any) {
      setPendingFiles((prev) =>
        prev.map((p, i) =>
          i === index ? { ...p, uploading: false, error: err.message } : p,
        ),
      );
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
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  if (loading && page === 1 && !search) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Bills" count={total} createPath="/bill/create">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => reload()}
          disabled={loading}
          title="Fetch the latest bills from the server"
        >
          Refresh
        </button>
      </PageHeader>

      {/* SharePoint folder summary */}
      {folderSummary?.is_linked && (
        <div className="folder-summary">
          <div className="folder-summary-info">
            <span className="folder-summary-icon">📂</span>
            <div>
              <span className="folder-summary-name">{folderSummary.folder_name ?? "Source Folder"}</span>
              <span className="folder-summary-count">
                {folderSummary.file_count} file{folderSummary.file_count !== 1 ? "s" : ""} to process
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(folderSummary.file_count ?? 0) > 0 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={processingFolder}
                onClick={handleProcessFolder}
                title={folderProgress?.currentFile ?? undefined}
              >
                {processingFolder
                  ? folderProgress && folderProgress.total > 0
                    ? `Processing ${folderProgress.done}/${folderProgress.total}...`
                    : "Processing..."
                  : "Process Folder"}
              </button>
            )}
            {folderSummary.folder_web_url && (
              <a
                href={folderSummary.folder_web_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary btn-sm"
                onClick={(e) => e.stopPropagation()}
              >
                Open in SharePoint
              </a>
            )}
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`drop-zone ${dragOver ? "drop-zone-active" : ""}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="drop-zone-icon">📁</span>
        <p className="drop-zone-text">Drag & drop bill files here</p>
        <p className="drop-zone-subtext">
          or{" "}
          <button
            type="button"
            className="drop-zone-browse"
            onClick={() => fileInputRef.current?.click()}
          >
            browse files
          </button>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
          style={{ display: "none" }}
          onChange={handleFileInput}
        />
      </div>

      {/* Pending files table */}
      {pendingFiles.length > 0 && (
        <div className="pending-files">
          <div className="pending-files-header">
            <h3>Files Ready for Import ({pendingFiles.length})</h3>
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearAllFiles}>
              Clear All
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Size</th>
                <th>Type</th>
                <th style={{ width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingFiles.map((entry, idx) => (
                <tr key={`${entry.file.name}-${idx}`}>
                  <td>{entry.file.name}</td>
                  <td>{fmtSize(entry.file.size)}</td>
                  <td>{entry.file.type.split("/")[1]?.toUpperCase() ?? entry.file.type}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => createBillFromFile(idx)}
                        disabled={entry.uploading}
                      >
                        {entry.uploading ? "Uploading..." : "Create Bill"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => removeFile(idx)}
                        disabled={entry.uploading}
                      >
                        Remove
                      </button>
                    </div>
                    {entry.error && (
                      <div style={{ color: "var(--color-error)", fontSize: 12, marginTop: 4 }}>
                        {entry.error}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="table-search">
        <input
          type="text"
          className="table-search-input"
          placeholder="Search bills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="table-filter-select"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="finalized">Finalized</option>
        </select>
        {(search || statusFilter) && (
          <span className="table-search-count">{total.toLocaleString()} results</span>
        )}
      </div>

      <table className="data-table">
        <thead>
          <tr>
            {[
              { key: "_vendor", label: "Vendor" },
              { key: "bill_number", label: "Bill #" },
              { key: "_date", label: "Date" },
              { key: "_project", label: "Project" },
              { key: "_amount", label: "Amount" },
              { key: "is_draft", label: "Status" },
            ].map((col) => (
              <th
                key={col.key}
                className="sortable-th"
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="sort-indicator">{sortDir === "asc" ? " ▲" : " ▼"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((bill) => (
            <tr
              key={bill.public_id}
              className="clickable-row"
              onClick={() => navigate(`/bill/${bill.public_id}`)}
            >
              <td>{bill._vendor}</td>
              <td>{bill.bill_number}</td>
              <td>{fmtDate(bill.bill_date)}</td>
              <td>{bill._project}</td>
              <td>{fmtMoney(bill.total_amount)}</td>
              <td>
                <span className={`status-badge ${bill.is_draft ? "draft" : "finalized"}`}>
                  {bill.is_draft ? "Draft" : "Finalized"}
                </span>
              </td>
            </tr>
          ))}
          {sortedItems.length === 0 && (
            <tr>
              <td colSpan={6} className="empty-state">
                {search ? "No matching bills." : "No bills found."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </div>
  );
}
