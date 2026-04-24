import { useState, useRef, type FormEvent, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { uploadFile, ApiError } from "../../api/client";

interface ImportSkip {
  row: number;
  reason: string;
}

interface ImportError {
  row: number;
  error: string;
}

interface ImportResult {
  import_batch_id: string;
  total_rows: number;
  imported_count: number;
  skipped_count: number;
  error_count: number;
  errors: ImportError[];
  unmatched_vendors: string[];
  unmatched_projects: string[];
  skipped?: ImportSkip[];
}

export default function ContractLaborImport() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");

  const handleFileSelect = (f: File) => {
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      setError("Please select an Excel file (.xlsx or .xls).");
      return;
    }
    setFile(f);
    setError("");
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select an Excel file first.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const res = await uploadFile<ImportResult>(
        "/api/v1/contract-labor/import",
        file,
        { carry_forward_rates: "true" },
      );
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Import failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Import Contract Labor</h1>
        <Link to="/contract-labor/list" className="btn btn-secondary">
          Back to List
        </Link>
      </div>

      {error && (
        <div className="form-error" style={{ marginBottom: 16 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result ? (
        <div className="detail-card" style={{ padding: 24 }}>
          <h3>Import Results</h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
              margin: "16px 0 24px",
            }}
          >
            <Stat value={result.imported_count} label="Imported" tone="success" />
            <Stat value={result.skipped_count} label="Skipped" tone="warning" />
            <Stat value={result.error_count} label="Errors" tone="error" />
            <Stat value={result.total_rows} label="Total Rows" />
          </div>

          <p>
            <strong>Batch ID:</strong> <code>{result.import_batch_id}</code>
          </p>

          {result.unmatched_vendors.length > 0 && (
            <Section
              title={`Unmatched Vendors (${result.unmatched_vendors.length})`}
              hint="These vendor names could not be matched. Create them in the system or check for typos."
              items={result.unmatched_vendors}
            />
          )}

          {result.unmatched_projects.length > 0 && (
            <Section
              title={`Unmatched Projects (${result.unmatched_projects.length})`}
              hint="These job names could not be matched. Create them or assign projects during review."
              items={result.unmatched_projects}
            />
          )}

          {result.skipped && result.skipped.length > 0 && (
            <Section
              title={`Skipped Rows (${result.skipped.length})`}
              hint="These rows were skipped during import."
              items={result.skipped
                .slice(0, 20)
                .map((s) => `Row ${s.row}: ${s.reason}`)
                .concat(
                  result.skipped.length > 20
                    ? [`... and ${result.skipped.length - 20} more skipped`]
                    : [],
                )}
            />
          )}

          {result.errors.length > 0 && (
            <Section
              title={`Errors (${result.errors.length})`}
              items={result.errors
                .slice(0, 20)
                .map((e) => `Row ${e.row}: ${e.error}`)
                .concat(
                  result.errors.length > 20
                    ? [`... and ${result.errors.length - 20} more errors`]
                    : [],
                )}
            />
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate("/contract-labor/list")}
            >
              Review Imported Entries
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleReset}>
              Import Another File
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="detail-card" style={{ padding: 24 }}>
          <h3>Excel File</h3>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? "#2563eb" : "#cbd5e1"}`,
              borderRadius: 8,
              padding: 40,
              textAlign: "center",
              cursor: "pointer",
              background: dragActive ? "#eff6ff" : "#f8fafc",
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
            <p style={{ margin: "8px 0", fontWeight: 500 }}>
              Drag &amp; drop Excel file here
            </p>
            <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: 14 }}>
              or <span style={{ color: "#2563eb", textDecoration: "underline" }}>browse files</span>
            </p>
            {file && (
              <p style={{ marginTop: 12, fontSize: 14 }}>
                <strong>Selected:</strong> {file.name}
              </p>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
              style={{ display: "none" }}
            />
          </div>

          <h3 style={{ marginTop: 32 }}>Expected Excel Format</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Expected Content</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["A", 'Date (e.g., "Tuesday, January 20, 2026")'],
                ["B", "Job (Project name/abbreviation)"],
                ["C", "Name (Vendor/contractor name)"],
                ["D", "Time In"],
                ["E", "Time Out"],
                ["F", "Break Time"],
                ["G", 'Regular Time (e.g., "08:30")'],
                ["H", "OT (Overtime)"],
                ["I", "Total Work Time"],
                ["J", "Notes"],
              ].map(([col, desc]) => (
                <tr key={col}>
                  <td>{col}</td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={uploading || !file}
            >
              {uploading ? "Importing..." : "Import File"}
            </button>
            <Link to="/contract-labor/list" className="btn btn-secondary">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "success" | "warning" | "error";
}) {
  const color =
    tone === "success"
      ? "#16a34a"
      : tone === "warning"
        ? "#d97706"
        : tone === "error"
          ? "#dc2626"
          : "#334155";
  return (
    <div
      style={{
        textAlign: "center",
        padding: 16,
        background: "#f8fafc",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 600, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{label}</div>
    </div>
  );
}

function Section({
  title,
  hint,
  items,
}: {
  title: string;
  hint?: string;
  items: string[];
}) {
  return (
    <div style={{ marginTop: 20 }}>
      <h4 style={{ marginBottom: 4 }}>{title}</h4>
      {hint && (
        <p style={{ marginTop: 0, color: "var(--color-text-secondary)", fontSize: 14 }}>
          {hint}
        </p>
      )}
      <ul style={{ marginTop: 8, paddingLeft: 20 }}>
        {items.map((it, i) => (
          <li key={i} style={{ fontSize: 14, marginBottom: 2 }}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
