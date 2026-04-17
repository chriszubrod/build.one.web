import { useState } from "react";

export interface LineItemFieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox" | "computed";
  options?: { value: string; label: string }[];
  align?: "left" | "right";
  width?: string;
  placeholder?: string;
}

interface InlineLineItemsProps<T extends Record<string, any>> {
  fields: LineItemFieldDef[];
  items: T[];
  onChange: (items: T[]) => void;
  newItem: () => T;
  /** Optional extra column rendered after all fields (e.g., attachment widget) */
  extraColumn?: { label: string; width?: string; render: (item: T, index: number) => React.ReactNode };
}

export default function InlineLineItems<T extends Record<string, any>>({
  fields,
  items,
  onChange,
  newItem,
  extraColumn,
}: InlineLineItemsProps<T>) {
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const updateItem = (index: number, key: string, value: any) => {
    const updated = items.map((item, i) =>
      i === index ? { ...item, [key]: value } : item
    );
    onChange(updated);
  };

  const addRow = () => {
    onChange([...items, newItem()]);
    setFocusIdx(items.length);
  };

  const removeRow = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="inline-line-items">
      <div className="inline-li-header">
        <h3 className="line-items-heading">Line Items ({items.length})</h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addRow}>
          + Add Row
        </button>
      </div>

      <div className="inline-li-table-wrap">
        <table className="data-table inline-li-table">
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.key} style={{ width: f.width, textAlign: f.align ?? "left" }}>
                  {f.label}
                </th>
              ))}
              {extraColumn && (
                <th style={{ width: extraColumn.width ?? "100px" }}>{extraColumn.label}</th>
              )}
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, rowIdx) => (
              <tr key={rowIdx}>
                {fields.map((f) => (
                  <td key={f.key} style={{ textAlign: f.align ?? "left" }}>
                    {f.type === "computed" ? (
                      <span className="inline-li-computed">{
                        (() => {
                          const v = item[f.key];
                          if (v == null || v === "") return "";
                          const n = Number(v);
                          return isNaN(n) ? v : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
                        })()
                      }</span>
                    ) : f.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={!!item[f.key]}
                        onChange={(e) => updateItem(rowIdx, f.key, e.target.checked)}
                      />
                    ) : f.type === "select" ? (
                      <select
                        className="inline-li-input"
                        value={item[f.key] ?? ""}
                        onChange={(e) => updateItem(rowIdx, f.key, e.target.value)}
                      >
                        <option value="">—</option>
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="inline-li-input"
                        type={f.type ?? "text"}
                        value={item[f.key] ?? ""}
                        onChange={(e) => updateItem(rowIdx, f.key, e.target.value)}
                        placeholder={f.placeholder}
                        autoFocus={focusIdx === rowIdx && f === fields[0]}
                        onFocus={() => setFocusIdx(null)}
                        step={f.type === "number" ? "any" : undefined}
                      />
                    )}
                  </td>
                ))}
                {extraColumn && (
                  <td>{extraColumn.render(item, rowIdx)}</td>
                )}
                <td>
                  <button
                    type="button"
                    className="inline-li-remove"
                    onClick={() => removeRow(rowIdx)}
                    title="Remove"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={fields.length + (extraColumn ? 2 : 1)} className="empty-state">
                  No line items. Click "+ Add Row" to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
