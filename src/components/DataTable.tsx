import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

export interface Column<T> {
  key: keyof T & string;
  label: string;
  render?: (value: T[keyof T], item: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T extends { public_id: string }> {
  columns: Column<T>[];
  data: T[];
  basePath: string;
  emptyMessage?: string;
  searchable?: boolean;
}

export default function DataTable<T extends { public_id: string }>({
  columns,
  data,
  basePath,
  emptyMessage = "No records found.",
  searchable = true,
}: DataTableProps<T>) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((item) =>
      columns.some((col) => {
        const v = item[col.key];
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey as keyof T];
      const bv = b[sortKey as keyof T];
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
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div>
      {searchable && data.length > 5 && (
        <div className="table-search">
          <input
            type="text"
            className="table-search-input"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <span className="table-search-count">
              {sorted.length} of {data.length}
            </span>
          )}
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={col.sortable !== false ? "sortable-th" : undefined}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="sort-indicator">{sortDir === "asc" ? " \u25B2" : " \u25BC"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <tr
              key={item.public_id}
              className="clickable-row"
              onClick={() => navigate(`${basePath}/${item.public_id}`)}
            >
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render
                    ? col.render(item[col.key], item)
                    : String(item[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty-state">
                {search ? "No matching records." : emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
