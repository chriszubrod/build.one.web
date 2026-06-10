import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getList } from "../../api/client";
import Sheet from "../../components/ui/Sheet";
import SheetHeader from "../../components/ui/SheetHeader";
import type { User } from "../../types/api";

interface UserPickerSheetProps {
  open: boolean;
  onDismiss: () => void;
  onSelect: (user: User) => void;
}

function initials(firstname?: string | null, lastname?: string | null): string {
  const f = (firstname ?? "").trim();
  const l = (lastname ?? "").trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (l) return l.slice(0, 2).toUpperCase();
  return "?";
}

function fullName(u: User): string {
  return [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || "(unnamed)";
}

export default function UserPickerSheet({ open, onDismiss, onSelect }: UserPickerSheetProps) {
  const [search, setSearch] = useState("");
  const usersQuery = useQuery<User[]>({
    queryKey: ["workers-roster"],
    queryFn: async () => (await getList<User>(`/api/v1/get/workers`)).data,
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });

  const filtered = useMemo<User[]>(() => {
    // Server curates the list (excludes agents + personas; includes
    // employees, contractors, Field Crew, and Interns). No additional
    // client-side filter beyond the search box.
    const workers = usersQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter((u) => fullName(u).toLowerCase().includes(q));
  }, [usersQuery.data, search]);

  return (
    <Sheet open={open} onDismiss={onDismiss}>
      <SheetHeader title="Pick a worker" onCancel={onDismiss} />
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
        {usersQuery.isLoading ? (
          <div className="project-picker-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="project-picker-empty">No matches.</div>
        ) : (
          <ul className="project-picker-list">
            {filtered.map((u) => (
              <li key={u.public_id}>
                <button
                  type="button"
                  className="project-picker-item"
                  onClick={() => onSelect(u)}
                >
                  <span className="project-picker-item-tile">
                    {initials(u.firstname, u.lastname)}
                  </span>
                  <span className="project-picker-item-name">{fullName(u)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
