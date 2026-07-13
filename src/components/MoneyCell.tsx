import type { Column } from "./DataTable";

export function formatMoneyParts(
  value: string | number | null | undefined,
): { text: string; parenthesized: boolean } | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return null;
  const text = n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    currencySign: "accounting",
  });
  // The trailing-paren gutter is reserved only when accounting formatting did
  // NOT already emit a closing paren. Deriving this from the rendered text
  // (rather than `n < 0`) keeps the gutter exactly in step with Intl — including
  // negative zero ("-0.00" formats as "($0.00)" yet `n < 0` is false), which
  // would otherwise reserve a second paren width and shift that row's decimals.
  return { text, parenthesized: text.endsWith(")") };
}

export default function MoneyCell({
  value,
}: {
  value: string | number | null | undefined;
}) {
  const parts = formatMoneyParts(value);
  // Empty inputs format to "" (nothing); non-numeric strings pass through raw.
  if (parts === null) return <>{String(value ?? "")}</>;
  return (
    <span className="money-cell">
      {parts.text}
      {!parts.parenthesized && (
        <span className="money-cell-gutter" aria-hidden="true">
          )
        </span>
      )}
    </span>
  );
}

/**
 * Column factory for a right-aligned money column in a `DataTable`. Centralizes
 * the shared money-cell wiring so list surfaces declare intent —
 * `moneyColumn("total_amount")` — instead of repeating the same column literal.
 */
export function moneyColumn<T>(
  key: keyof T & string,
  label = "Amount",
): Column<T> {
  return {
    key,
    label,
    align: "right",
    render: (v) => <MoneyCell value={v as string | null} />,
  };
}
