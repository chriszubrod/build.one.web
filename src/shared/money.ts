/**
 * Exact-decimal line-item money math (qty × rate, markup, cent rounding).
 *
 * Parsing, multiply, and cent rounding (steps 2–4) never use IEEE doubles on
 * the value path — operand size is irrelevant and results are exact for
 * DECIMAL(18,4) string inputs. The only float step is the final
 * `Number(cents) / 100`, guarded when |cents| exceeds MAX_SAFE_INTEGER
 * (degrades to the legacy float multiply + roundMoney path).
 *
 * Callers passing raw decimal strings are exact end-to-end. Callers that have
 * already parsed to a number rely on `String(n)` recovering the shortest
 * round-trip decimal — the same assumption documented on `roundMoney`, so this
 * is never weaker than the status quo.
 */

export type Decimalish = string | number;

type ParsedDecimal = { sign: 1n | -1n; mant: bigint; scale: number };

/** Strict decimal grammar before any BigInt parse (exponent must be integer digits). */
const WELL_FORMED_DECIMAL =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Caps BigInt size; still far beyond DECIMAL(18,4) inputs. */
const MAX_DECIMAL_EXPONENT = 1000;

/** Largest cent count a double represents exactly — the bound on the one float step. */
const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

function isWellFormedBoundedDecimal(raw: string): boolean {
  const s = raw.trim();
  if (s === "") return true;
  if (!WELL_FORMED_DECIMAL.test(s)) return false;
  const eIdx = s.search(/[eE]/);
  if (eIdx >= 0) {
    const exp = Number(s.slice(eIdx + 1));
    if (!Number.isFinite(exp) || Math.abs(exp) > MAX_DECIMAL_EXPONENT) {
      return false;
    }
  }
  return true;
}

function canonicalDecimalString(v: Decimalish | null | undefined): string {
  if (v === null || v === undefined || v === "") return "0";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return "0";
  return String(v);
}

function parseDecimal(raw: string): ParsedDecimal {
  let s = raw.trim();
  if (s === "") return { sign: 1n, mant: 0n, scale: 0 };

  let sign: 1n | -1n = 1n;
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("-")) {
    sign = -1n;
    s = s.slice(1);
  }

  if (s === "" || s === ".") return { sign: 1n, mant: 0n, scale: 0 };

  let exp = 0;
  const eIdx = s.search(/[eE]/);
  if (eIdx >= 0) {
    exp = Number(s.slice(eIdx + 1));
    if (!Number.isFinite(exp)) exp = 0;
    s = s.slice(0, eIdx);
  }

  let intPart = s;
  let fracPart = "";
  const dotIdx = s.indexOf(".");
  if (dotIdx >= 0) {
    intPart = s.slice(0, dotIdx);
    fracPart = s.slice(dotIdx + 1);
  }

  // No digit-stripping or leading-zero trim needed: every caller gates on
  // isWellFormedBoundedDecimal first, so by here the sign and exponent are
  // already removed and the single dot already split — `intPart + fracPart`
  // is digits-only by construction. BigInt tolerates leading zeros and "".
  let scale = fracPart.length - exp;
  let mant = BigInt(intPart + fracPart);

  if (scale < 0) {
    mant *= 10n ** BigInt(-scale);
    scale = 0;
  }

  return { sign, mant, scale };
}

function absBigInt(n: bigint): bigint {
  return n < 0n ? -n : n;
}

/** Multiply two parsed decimals and round the product to integer cents (half away from zero). */
function multiplyParsedToCents(a: ParsedDecimal, b: ParsedDecimal): bigint {
  const productSign = a.sign * b.sign;
  const m = a.mant * b.mant;
  const s = a.scale + b.scale;
  const absM = absBigInt(m);

  let cents: bigint;
  if (s <= 2) {
    cents = absM * 10n ** BigInt(2 - s);
  } else {
    const d = 10n ** BigInt(s - 2);
    let q = absM / d;
    const rem = absM % d;
    if (2n * rem >= d) q += 1n;
    cents = q;
  }

  return productSign < 0n ? -cents : cents;
}

function formatDecimal(mant: bigint, scale: number, sign: 1n | -1n): string {
  const prefix = sign < 0n ? "-" : "";
  const absM = absBigInt(mant);
  const s = absM.toString();
  if (scale <= 0) {
    const zeros = "0".repeat(-scale);
    return prefix + s + zeros;
  }
  if (s.length <= scale) {
    return prefix + "0." + s.padStart(scale, "0");
  }
  const intPart = s.slice(0, s.length - scale);
  const fracPart = s.slice(s.length - scale);
  return prefix + intPart + "." + fracPart;
}

function centsToNumber(cents: bigint, floatFallback: () => number): number {
  const absCents = absBigInt(cents);
  if (absCents > MAX_SAFE_CENTS) {
    return floatFallback();
  }
  return Number(cents) / 100;
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

/**
 * `qty × rate`, exact, **returned already rounded to cents**. Callers do not
 * need to wrap this in `roundMoney` — doing so is a provable no-op. (The one
 * place `roundMoney` still belongs is over a value this did NOT produce, e.g.
 * `computeBillLine`'s preserved lump-sum `li.amount`.)
 */
export function computeAmount(qty: Decimalish, rate: Decimalish): number {
  const qs = canonicalDecimalString(qty);
  const rs = canonicalDecimalString(rate);
  const floatFallback = () => roundMoney(Number(qs) * Number(rs));
  if (!isWellFormedBoundedDecimal(qs) || !isWellFormedBoundedDecimal(rs)) {
    return floatFallback();
  }
  const a = parseDecimal(qs);
  const b = parseDecimal(rs);
  const cents = multiplyParsedToCents(a, b);
  return centsToNumber(cents, floatFallback);
}

/**
 * `amount × (1 + markupFraction)`, exact, **returned already rounded to cents**.
 * The `1 +` is done in decimal space, so no float add reintroduces error.
 * Takes a FRACTION (0.25), not a percent — see `percentToFraction`.
 */
export function applyMarkup(amount: Decimalish, markupFraction: Decimalish): number {
  const as = canonicalDecimalString(amount);
  const ms = canonicalDecimalString(markupFraction);
  const floatFallback = () => roundMoney(Number(as) * (1 + Number(ms)));
  if (!isWellFormedBoundedDecimal(as) || !isWellFormedBoundedDecimal(ms)) {
    return floatFallback();
  }
  const amt = parseDecimal(as);
  const mk = parseDecimal(ms);
  const signedOnePlusMant = mk.sign * mk.mant + 10n ** BigInt(mk.scale);
  const onePlus: ParsedDecimal =
    signedOnePlusMant >= 0n
      ? { sign: 1n, mant: signedOnePlusMant, scale: mk.scale }
      : { sign: -1n, mant: -signedOnePlusMant, scale: mk.scale };
  const cents = multiplyParsedToCents(amt, onePlus);
  return centsToNumber(cents, floatFallback);
}

/** Divide a percentage by 100 via decimal point shift (not float / 100). */
export function percentToFraction(pct: Decimalish): string {
  const s = canonicalDecimalString(pct);
  // Malformed pct: legacy UI used toNum(pct)/100 (non-finite → 0 markup fraction).
  if (!isWellFormedBoundedDecimal(s)) return "0";
  const p = parseDecimal(s);
  return formatDecimal(p.mant, p.scale + 2, p.sign);
}
