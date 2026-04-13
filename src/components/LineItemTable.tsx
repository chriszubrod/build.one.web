export interface LineItemColumn<T> {
  key: keyof T & string;
  label: string;
  align?: "left" | "right";
  render?: (value: T[keyof T], item: T) => React.ReactNode;
}

interface LineItemTableProps<T> {
  columns: LineItemColumn<T>[];
  items: T[];
  emptyMessage?: string;
}

export default function LineItemTable<T>({
  columns,
  items,
  emptyMessage = "No line items.",
}: LineItemTableProps<T>) {
  return (
    <div className="line-items-section">
      <h3 className="line-items-heading">Line Items ({items.length})</h3>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.align === "right" ? { textAlign: "right" } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col.key} style={col.align === "right" ? { textAlign: "right" } : undefined}>
                  {col.render
                    ? col.render(item[col.key], item)
                    : String(item[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty-state">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
