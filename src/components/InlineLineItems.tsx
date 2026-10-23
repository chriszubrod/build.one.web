import { Fragment, useState, type ReactNode } from "react";
import LazyCombobox from "./ui/LazyCombobox";

export interface LineItemColWidth {
  className: string;
  contract: string;
}

export interface LineItemFieldDef<T extends UidRow = UidRow> {
  key: string;
  label: string;
  type?: "text" | "number" | "select" | "combobox" | "checkbox" | "computed";
  /** For `select` / `combobox` — callers must memoize; combobox requires referential stability. */
  options?: { value: string; label: string }[];
  /** Combobox only; default 50 in Combobox. */
  maxResults?: number;
  align?: "left" | "right" | "center";
  width?: string;
  placeholder?: string;
  hint?: (item: T) => string | null;
  /** Measured layout: colgroup class + data-width-contract */
  col?: LineItemColWidth;
  /** Measured layout: badge row under control */
  adornment?: (item: T, index: number) => ReactNode;
  /** Measured layout: custom control (replaces default input for this field) */
  render?: (item: T, index: number, update: (value: unknown) => void) => ReactNode;
  /** Measured layout: read-only display in line-item-readonly */
  readOnly?: boolean;
  format?: (value: unknown) => string;
}

export type UidRow = Record<string, any> & { uid: string };

interface ExtraColumn<T extends UidRow> {
  label: string;
  width?: string;
  col?: LineItemColWidth;
  render: (item: T, index: number) => ReactNode;
}

type InlineLineItemsBase<T extends UidRow> = {
  fields: LineItemFieldDef<T>[];
  items: T[];
  layout?: "default" | "measured";
  /** Extra classes on measured table (line-items-measured is added automatically) */
  tableClassName?: string;
  actionsCol?: LineItemColWidth;
  headerHint?: ReactNode;
  headerActions?: ReactNode;
  addLabel?: string;
  addPlacement?: "header" | "below";
  addDisabled?: boolean;
  footer?: ReactNode;
  emptyState?: boolean;
  minRows?: number;
  removeLabel?: (index: number) => string;
  removeTitle?: string;
  extraColumn?: ExtraColumn<T>;
};

type InlineLineItemsProps<T extends UidRow> = InlineLineItemsBase<T> &
  (
    | {
        onEdit: (index: number, key: string, value: unknown) => void;
        onAdd: () => void;
        onRemove: (index: number) => void;
        onChange?: (items: T[]) => void;
        newItem?: () => T;
      }
    | {
        onChange: (items: T[]) => void;
        newItem: () => T;
        onEdit?: undefined;
        onAdd?: undefined;
        onRemove?: undefined;
      }
  );

function defaultFormatMoney(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function InlineLineItems<T extends UidRow>(props: InlineLineItemsProps<T>) {
  const {
    fields,
    items,
    layout = "default",
    tableClassName = "",
    actionsCol,
    headerHint,
    headerActions,
    addLabel = "+ Add Row",
    addPlacement = "header",
    addDisabled = false,
    footer,
    emptyState = true,
    minRows,
    removeLabel,
    removeTitle = "Remove",
    onEdit,
    onAdd,
    onRemove,
    extraColumn,
  } = props;

  const onChange = "onChange" in props ? props.onChange : undefined;
  const newItem = "newItem" in props ? props.newItem : undefined;

  const [focusUid, setFocusUid] = useState<string | null>(null);
  const isMeasured = layout === "measured";
  const showRemoveForRow = minRows == null || items.length > minRows;

  const updateItem = (index: number, key: string, value: unknown) => {
    if (onEdit) {
      onEdit(index, key, value);
      return;
    }
    if (!onChange) return;
    const updated = items.map((item, i) =>
      i === index ? { ...item, [key]: value } : item,
    );
    onChange(updated);
  };

  const addRow = () => {
    if (onAdd) {
      onAdd();
      return;
    }
    if (!onChange || !newItem) return;
    const item = newItem();
    onChange([...items, item]);
    setFocusUid(item.uid);
  };

  const removeRow = (index: number) => {
    if (onRemove) {
      onRemove(index);
      return;
    }
    if (!onChange) return;
    onChange(items.filter((_, i) => i !== index));
  };

  const resolvedHeading = `Line Items (${items.length})`;
  const showAddInHeader = addPlacement === "header";
  const showAddBelow = addPlacement === "below";

  const renderDefaultCell = (item: T, rowIdx: number, f: LineItemFieldDef<T>) => {
    if (f.type === "computed") {
      return <span className="inline-li-computed">{defaultFormatMoney(item[f.key])}</span>;
    }
    if (f.type === "checkbox") {
      return (
        <>
          <input
            type="checkbox"
            checked={!!item[f.key]}
            onChange={(e) => updateItem(rowIdx, f.key, e.target.checked)}
          />
          {f.hint?.(item) ? (
            <span className="inline-li-hint text-muted" style={{ display: "block", fontSize: 11 }}>
              {f.hint(item)}
            </span>
          ) : null}
        </>
      );
    }
    if (f.type === "select") {
      return (
        <select
          className="inline-li-input"
          value={(item[f.key] as string) ?? ""}
          onChange={(e) => updateItem(rowIdx, f.key, e.target.value)}
        >
          <option value="">—</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    if (f.type === "combobox") {
      const cellValue = String(item[f.key] ?? "");
      return (
        <LazyCombobox
          variant="inline"
          ariaLabel={f.label}
          name={`${f.key}-${item.uid}`}
          value={cellValue}
          onChange={(v) => updateItem(rowIdx, f.key, v)}
          options={f.options ?? []}
          maxResults={f.maxResults}
          placeholder={f.placeholder}
          required={false}
        />
      );
    }
    return (
      <input
        className="inline-li-input"
        type={f.type ?? "text"}
        value={(item[f.key] as string) ?? ""}
        onChange={(e) => updateItem(rowIdx, f.key, e.target.value)}
        placeholder={f.placeholder}
        autoFocus={focusUid === item.uid && f === fields[0]}
        onFocus={() => setFocusUid(null)}
        step={f.type === "number" ? "any" : undefined}
      />
    );
  };

  const measuredAlignClass = (align?: "left" | "right" | "center") => {
    if (align === "right") return " line-item-cell-align-right";
    if (align === "center") return " line-item-cell-align-center";
    return "";
  };

  const measuredCell = (
    control: ReactNode,
    badge: ReactNode,
    opts?: { align?: "left" | "right" | "center"; computed?: boolean },
  ) => (
    <td
      className={`line-item-cell${measuredAlignClass(opts?.align)}${
        opts?.computed ? " line-item-cell-computed" : ""
      }`}
    >
      <div className="line-item-control">{control}</div>
      <div className="line-item-badge-slot">{badge}</div>
    </td>
  );

  const renderMeasuredFieldCell = (item: T, rowIdx: number, f: LineItemFieldDef<T>) => {
    const badge = f.adornment?.(item, rowIdx) ?? null;
    const pushUpdate = (value: unknown) => updateItem(rowIdx, f.key, value);

    if (f.render) {
      return measuredCell(f.render(item, rowIdx, pushUpdate), badge, {
        align: f.align,
        computed: f.readOnly,
      });
    }

    if (f.readOnly) {
      const formatted = f.format
        ? f.format(item[f.key])
        : f.type === "computed"
          ? defaultFormatMoney(item[f.key])
          : String(item[f.key] ?? "");
      return measuredCell(
        <div className="line-item-readonly inline-li-computed">{formatted}</div>,
        badge,
        { align: f.align ?? "right", computed: true },
      );
    }

    return measuredCell(renderDefaultCell(item, rowIdx, f), badge, { align: f.align });
  };

  const headerClass =
    isMeasured && headerHint
      ? "inline-li-header inline-li-header-with-hint"
      : "inline-li-header";

  const measuredTableClasses = ["data-table", "line-items-edit-table", "line-items-measured", tableClassName]
    .filter(Boolean)
    .join(" ");

  const tableClasses = isMeasured ? measuredTableClasses : "data-table inline-li-table";

  const addButton = (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={addRow}
      disabled={addDisabled}
    >
      {addLabel}
    </button>
  );

  return (
    <div className="inline-line-items">
      <div className={headerClass}>
        <h3 className="line-items-heading">{resolvedHeading}</h3>
        {headerHint ? (
          <span className="text-muted inline-li-header-hint" style={{ fontSize: 12 }}>
            {headerHint}
          </span>
        ) : null}
        {isMeasured ? (
          <div className="inline-li-header-actions">
            {headerActions}
            {showAddInHeader ? addButton : null}
          </div>
        ) : showAddInHeader ? (
          addButton
        ) : null}
      </div>

      <div className="inline-li-table-wrap">
        <table className={tableClasses}>
          {isMeasured ? (
            <colgroup>
              {fields.map((f) =>
                f.col ? (
                  <col
                    key={f.key}
                    className={f.col.className}
                    data-width-contract={f.col.contract}
                  />
                ) : (
                  <col key={f.key} />
                ),
              )}
              {extraColumn?.col ? (
                <col
                  className={extraColumn.col.className}
                  data-width-contract={extraColumn.col.contract}
                />
              ) : null}
              {actionsCol ? (
                <col className={actionsCol.className} data-width-contract={actionsCol.contract} />
              ) : null}
            </colgroup>
          ) : null}
          <thead>
            <tr>
              {fields.map((f) => (
                <th
                  key={f.key}
                  style={
                    layout === "default"
                      ? { width: f.width, textAlign: f.align ?? "left" }
                      : f.align === "right"
                        ? { textAlign: "right" }
                        : f.align === "center"
                          ? { textAlign: "center" }
                          : undefined
                  }
                >
                  {f.label}
                </th>
              ))}
              {extraColumn && (
                <th
                  style={
                    layout === "default" ? { width: extraColumn.width ?? "100px" } : undefined
                  }
                >
                  {extraColumn.label}
                </th>
              )}
              {isMeasured ? (
                <th aria-label="Actions" />
              ) : (
                <th style={{ width: 40 }} />
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, rowIdx) => (
              <tr key={item.uid}>
                {isMeasured
                  ? fields.map((f) => (
                      <Fragment key={f.key}>{renderMeasuredFieldCell(item, rowIdx, f)}</Fragment>
                    ))
                  : fields.map((f) => {
                      const control = renderDefaultCell(item, rowIdx, f);
                      if (!f.adornment) {
                        return (
                          <td key={f.key} style={{ textAlign: f.align ?? "left" }}>
                            {control}
                          </td>
                        );
                      }
                      const badge = f.adornment(item, rowIdx) ?? null;
                      return (
                        <td key={f.key} style={{ textAlign: f.align ?? "left" }}>
                          <div className="line-item-control">{control}</div>
                          {badge ? <div className="line-item-badge-slot">{badge}</div> : null}
                        </td>
                      );
                    })}
                {extraColumn &&
                  (isMeasured
                    ? measuredCell(extraColumn.render(item, rowIdx), null)
                    : (
                      <td>{extraColumn.render(item, rowIdx)}</td>
                    ))}
                {isMeasured ? (
                  measuredCell(
                    showRemoveForRow ? (
                      <button
                        type="button"
                        className="inline-li-remove"
                        onClick={() => removeRow(rowIdx)}
                        title={removeTitle}
                        aria-label={removeLabel?.(rowIdx)}
                      >
                        &times;
                      </button>
                    ) : null,
                    null,
                    { align: "center" },
                  )
                ) : (
                  <td>
                    <button
                      type="button"
                      className="inline-li-remove"
                      onClick={() => removeRow(rowIdx)}
                      title={removeTitle}
                    >
                      &times;
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {emptyState && items.length === 0 && (
              <tr>
                <td
                  colSpan={fields.length + (extraColumn ? 2 : 1)}
                  className="empty-state"
                >
                  No line items. Click &quot;{addLabel}&quot; to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showAddBelow ? (
        <div style={{ marginTop: 8 }}>
          {addButton}
        </div>
      ) : null}

      {footer}
    </div>
  );
}
