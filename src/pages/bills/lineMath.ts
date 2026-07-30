/**
 * Shared compute helper for Bill line items. Both BillCreate (single
 * placeholder line) and BillEdit (the line-item array) recompute the
 * `amount = qty * rate` and `price = amount * (1 + markup)` fields the
 * same way, with the same toFixed(2) + empty-string fallback.
 *
 * Generic on the row shape so each call site keeps its own surrounding
 * fields (public_id / row_version / project_public_id / etc.) untouched
 * on the spread.
 */
export interface BillLineMathFields {
  quantity: string;
  rate: string;
  markup: string;
  amount: string;
  price: string;
}

/**
 * Sum of line `amount`s in dollars. One spelling for every call site
 * (load-time persisted total, saveAll's computed total, the rendered
 * total) — empty string / null / undefined all count as 0.
 */
export function sumLineAmounts(rows: { amount?: string | null }[]): number {
  return rows.reduce((sum, r) => sum + (r.amount ? Number(r.amount) : 0), 0);
}

export function computeBillLine<T extends BillLineMathFields>(li: T): T {
  const hasQty = li.quantity !== "";
  const hasRate = li.rate !== "";
  const markup = li.markup !== "" ? Number(li.markup) : 0;
  // Derive amount = quantity * rate ONLY when BOTH are present (a unit×rate
  // line). Otherwise preserve the existing amount. Lump-sum lines — most
  // importantly QBO account-based expense lines — carry an Amount with a
  // NULL/blank Quantity and Rate, and the Amount cell is display-only, so the
  // stored amount IS the only correct value. Unconditionally recomputing
  // 0 * 0 here silently zeroed those lines on load / edit / add-row and
  // persisted $0 on the next save (money loss, U-167). See lineMath.test.ts.
  const amount =
    hasQty && hasRate
      ? Number(li.quantity) * Number(li.rate)
      : li.amount !== ""
        ? Number(li.amount)
        : 0;
  const price = amount * (1 + markup);
  return {
    ...li,
    amount: amount ? amount.toFixed(2) : "",
    price: price ? price.toFixed(2) : "",
  };
}
