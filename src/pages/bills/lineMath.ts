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

/**
 * Round `n` to two decimal places (cents), half away from zero.
 *
 * Scaling happens in decimal-string space: `String(x)` returns the shortest
 * decimal that round-trips to `x`, which recovers the intended decimal 1.005
 * from the noisy double 1.00499999999999989; bumping the exponent by 2 shifts
 * it exactly, so `Math.round` sees a true half. Split on `"e"` so an
 * already-exponential input like `1e-7` keeps its own exponent instead of
 * parsing to NaN. Do NOT use `Math.round(n * 100) / 100` — the float
 * *multiply* is what reintroduces the error; the divide-back below is safe,
 * because the guard proves `shifted` is an exact integer <= MAX_SAFE_INTEGER
 * and IEEE-754 division is correctly rounded. Do NOT use a bare `Math.round`
 * on a signed value either: its halves round toward +Infinity, which returns
 * -1.00 for -1.005 instead of -1.01.
 *
 * Named `roundMoney`, deliberately NOT `roundToCents`: `budgets/revisionLedger.ts`
 * already exports a `roundToCents` that returns integer CENTS (1234.56 -> 123456).
 * Both take and return a `number`, so importing the wrong one is a silent 100x
 * money error that the type checker cannot catch.
 *
 * Follow-up (not tracked anywhere yet): this same decision is spelled three more
 * times — `BudgetEdit.tsx::compute` (still on the un-rounded path, carrying both
 * defects this fixed), and `LaborReviewScreen.tsx` + `ContractLaborEdit.tsx`,
 * which round PERSISTED prices via `Number(x.toFixed(2))`. A shared
 * `src/shared/money.ts` is the eventual home, once it has real consumers.
 */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return n;
  const sign = n < 0 ? -1 : 1;
  const [mant, exp = "0"] = String(Math.abs(n)).split("e");
  const shifted = Number(`${mant}e${Number(exp) + 2}`);
  // Guard the shift. At 2^50 the shifted double's ULP reaches 0.25, so a true
  // `…24.4` snaps to a spurious `…24.5` and Math.round takes it UP:
  // 11258999068426.244 would yield …26.25 where toFixed(2) correctly gives
  // …26.24. Cut off a full binade below that and degrade to the input
  // unchanged — exactly the pre-fix toFixed(2) behavior. The isFinite half also
  // catches overflow to Infinity, and is explicit because NaN would slip past a
  // bare `>=` comparison.
  //
  // The honest bound, since the cutoff is a mitigation and not a proof.
  // `roundMoney` is exact with respect to the value's SHORTEST ROUND-TRIP
  // DECIMAL — what the user actually typed — which is the whole reason the
  // half-cent fix works at all: String() recovers "1.005" from the noisy double.
  // It cannot be exact with respect to a LONGER decimal that collapses onto the
  // same double: Number("99999999.00499999") === Number("99999999.005"), so no
  // function taking a `number` can tell those two apart, and either answer is
  // wrong for one of them. (toFixed(2) resolves that pair the other way — which
  // is precisely the defect this replaced.) Fixing that class would mean
  // carrying the decimal string end to end instead of a double.
  //
  // Verified exact against the shortest-round-trip decimal across 1.2M samples
  // up to $100M at 8 fractional digits — the worst case Quantity/Rate
  // DECIMAL(18,4) can produce. Above the cutoff we deliberately return the
  // pre-fix answer rather than risk the spurious-.5 corruption, so a value
  // between roughly $1T and the cutoff keeps toFixed(2)'s result.
  if (!Number.isFinite(shifted) || Math.abs(shifted) >= 2 ** 49) return n;
  return (sign * Math.round(shifted)) / 100;
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
  const roundedAmount = roundMoney(amount);
  const roundedPrice = roundMoney(roundedAmount * (1 + markup));
  return {
    ...li,
    amount: roundedAmount ? roundedAmount.toFixed(2) : "",
    price: roundedPrice ? roundedPrice.toFixed(2) : "",
  };
}
