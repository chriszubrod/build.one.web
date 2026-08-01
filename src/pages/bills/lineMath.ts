import { applyMarkup, computeAmount, roundMoney } from "../../shared/money";

/**
 * Shared compute helper for Bill line items. Both BillCreate (single
 * placeholder line) and BillEdit (the line-item array) recompute the
 * `amount = qty * rate` and `price = amount * (1 + markup)` fields the
 * same way: amounts and prices are rounded to cents via `roundMoney`
 * (half away from zero), then formatted with toFixed(2); values that round
 * to zero cents render as empty string.
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
 *
 * Deliberately NOT rounded, and safe only because of an invariant worth
 * stating: every `amount` is written by `computeBillLine` as `toFixed(2)` of
 * an already-cent-rounded value, so each addend is an exact 2-decimal
 * decimal and the true sum can never land on a half-cent. Accumulated float
 * error (~n·ε·|total|, well under a millionth of a dollar for any real bill)
 * is orders of magnitude below the $0.005 that would change the rounded
 * result, and BOTH sinks re-round anyway — the wire lands in
 * `Bill.TotalAmount DECIMAL(18,2)` and the UI renders through
 * `toLocaleString(… style:"currency")`. So a `0.30000000000000004` does reach
 * the request body, and is provably annihilated before it is stored or shown.
 * If a consumer is ever added that does NOT round at its sink — a CSV/JSON
 * export, an equality check against a server total, a QBO push built from
 * this value — that consumer must round, or this must.
 */
export function sumLineAmounts(rows: { amount?: string | null }[]): number {
  return rows.reduce((sum, r) => sum + (r.amount ? Number(r.amount) : 0), 0);
}

export function computeBillLine<T extends BillLineMathFields>(li: T): T {
  const hasQty = li.quantity !== "";
  const hasRate = li.rate !== "";
  // Derive amount = quantity * rate ONLY when BOTH are present (a unit×rate
  // line). Otherwise preserve the existing amount. Lump-sum lines — most
  // importantly QBO account-based expense lines — carry an Amount with a
  // NULL/blank Quantity and Rate, and the Amount cell is display-only, so the
  // stored amount IS the only correct value. Unconditionally recomputing
  // 0 * 0 here silently zeroed those lines on load / edit / add-row and
  // persisted $0 on the next save (money loss, U-167). See lineMath.test.ts.
  // computeAmount already returns a cent-rounded value; roundMoney is needed
  // only on the preserved lump-sum amount, which is a raw stored decimal.
  const roundedAmount =
    hasQty && hasRate
      ? computeAmount(li.quantity, li.rate)
      : li.amount !== ""
        ? roundMoney(Number(li.amount))
        : 0;
  const roundedPrice = applyMarkup(roundedAmount, li.markup);
  return {
    ...li,
    amount: roundedAmount ? roundedAmount.toFixed(2) : "",
    price: roundedPrice ? roundedPrice.toFixed(2) : "",
  };
}
