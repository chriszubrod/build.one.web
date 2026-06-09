import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLookups } from "../../hooks/useLookups";
import Sheet from "../../components/ui/Sheet";
import SheetHeader from "../../components/ui/SheetHeader";
import type { LookupProject } from "../../types/api";

interface ProjectPickerSheetProps {
  open: boolean;
  onDismiss: () => void;
  onSelect: (project: LookupProject) => void;
}

function projectAbbrev(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase() || "—";
}

export default function ProjectPickerSheet({ open, onDismiss, onSelect }: ProjectPickerSheetProps) {
  const { data: lookups } = useLookups("projects");
  const [search, setSearch] = useState("");

  const filtered = useMemo<LookupProject[]>(() => {
    const all = lookups.projects ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p: LookupProject) => (p.name ?? "").toLowerCase().includes(q));
  }, [lookups.projects, search]);

  return (
    <Sheet open={open} onDismiss={onDismiss}>
      <SheetHeader title="Pick a project" onCancel={onDismiss} />
      <div className="sheet-body" style={{ padding: 0, paddingTop: "var(--space-md)" }}>
        <div className="project-picker-search">
          <Search size={16} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        {filtered.length === 0 ? (
          <div className="project-picker-empty">
            {(lookups.projects ?? []).length === 0 ? "Loading projects…" : "No matches."}
          </div>
        ) : (
          <ul className="project-picker-list">
            {filtered.map((p) => (
              <li key={p.public_id}>
                <button
                  type="button"
                  className="project-picker-item"
                  onClick={() => onSelect(p)}
                >
                  <span className="project-picker-item-tile">{projectAbbrev(p.name ?? "")}</span>
                  <span className="project-picker-item-name">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
