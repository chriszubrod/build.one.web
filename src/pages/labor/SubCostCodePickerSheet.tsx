import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLookups } from "../../hooks/useLookups";
import Sheet from "../../components/ui/Sheet";
import SheetHeader from "../../components/ui/SheetHeader";
import type { LookupSubCostCode } from "../../types/api";

interface SubCostCodePickerSheetProps {
  open: boolean;
  onDismiss: () => void;
  onSelect: (scc: LookupSubCostCode) => void;
}

export default function SubCostCodePickerSheet({
  open,
  onDismiss,
  onSelect,
}: SubCostCodePickerSheetProps) {
  const { data: lookups } = useLookups("sub_cost_codes");
  const [search, setSearch] = useState("");

  const filtered = useMemo<LookupSubCostCode[]>(() => {
    const all = lookups.sub_cost_codes ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((scc) => {
      const haystack = `${scc.number ?? ""} ${scc.name ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [lookups.sub_cost_codes, search]);

  return (
    <Sheet open={open} onDismiss={onDismiss}>
      <SheetHeader title="Pick a sub cost code" onCancel={onDismiss} />
      <div className="sheet-body" style={{ padding: 0, paddingTop: "var(--space-md)" }}>
        <div className="project-picker-search">
          <Search size={16} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search by number or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        {filtered.length === 0 ? (
          <div className="project-picker-empty">
            {(lookups.sub_cost_codes ?? []).length === 0 ? "Loading…" : "No matches."}
          </div>
        ) : (
          <ul className="project-picker-list">
            {filtered.map((scc) => (
              <li key={scc.public_id}>
                <button
                  type="button"
                  className="project-picker-item"
                  onClick={() => onSelect(scc)}
                >
                  <span className="project-picker-item-tile">{scc.number ?? "—"}</span>
                  <span className="project-picker-item-name">{scc.name ?? "(unnamed)"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
