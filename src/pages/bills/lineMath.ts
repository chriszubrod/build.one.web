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

export function computeBillLine<T extends BillLineMathFields>(li: T): T {
  const qty = li.quantity !== "" ? Number(li.quantity) : 0;
  const rate = li.rate !== "" ? Number(li.rate) : 0;
  const markup = li.markup !== "" ? Number(li.markup) : 0;
  const amount = qty * rate;
  const price = amount * (1 + markup);
  return {
    ...li,
    amount: amount ? amount.toFixed(2) : "",
    price: price ? price.toFixed(2) : "",
  };
}
