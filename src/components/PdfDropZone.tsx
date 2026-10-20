import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export interface PdfDropZoneProps {
  icon: string;
  text: string;
  onSelect: (accepted: File[], rejected: File[], source: "drop" | "browse") => void;
  multiple?: boolean;
  /** When true, drag/drop and browse are ignored. */
  disabled?: boolean;
  accept?: string;
  children?: ReactNode;
}

export default function PdfDropZone({
  icon,
  text,
  onSelect,
  multiple = false,
  disabled = false,
  accept = "application/pdf,.pdf",
  children,
}: PdfDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const partitionFiles = (list: FileList | File[]) => {
    // Single mode judges only the first file, as the hand-copied zones did (files[0]).
    const files = multiple ? Array.from(list) : Array.from(list).slice(0, 1);
    const accepted: File[] = [];
    const rejected: File[] = [];
    for (const f of files) {
      if (isPdfFile(f)) accepted.push(f);
      else rejected.push(f);
    }
    return { accepted, rejected };
  };

  const deliverSelection = (list: FileList | File[], source: "drop" | "browse") => {
    const { accepted, rejected } = partitionFiles(list);
    if (accepted.length === 0 && rejected.length === 0) return;
    onSelect(accepted, rejected, source);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files.length > 0) {
      deliverSelection(e.dataTransfer.files, "drop");
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      deliverSelection(e.target.files, "browse");
      e.target.value = "";
    }
  };

  return (
    <div
      className={`drop-zone ${dragOver ? "drop-zone-active" : ""}`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="drop-zone-icon">{icon}</span>
      <p className="drop-zone-text">{text}</p>
      <p className="drop-zone-subtext">
        or{" "}
        <button
          type="button"
          className="drop-zone-browse"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          browse files
        </button>
      </p>
      {children}
      <input
        ref={fileInputRef}
        type="file"
        multiple={multiple || undefined}
        accept={accept}
        style={{ display: "none" }}
        onChange={handleFileInput}
        disabled={disabled}
      />
    </div>
  );
}
