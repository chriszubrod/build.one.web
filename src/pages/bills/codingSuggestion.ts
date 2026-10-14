import { rawRequest } from "../../api/client";
import type {
  BillCodingBudgetCheck,
  BillCodingSuggestRequest,
  BillCodingSuggestResponse,
  BillLineCodingPrefillState,
} from "../../types/api";

// Wire types live in types/api.ts; these are the page-side names for them.
export type CodingPrefillState = BillLineCodingPrefillState;
export type BillCodingSuggestion = BillCodingSuggestResponse;
export type BillCodingSuggestionSource = BillCodingSuggestResponse["source"];
export type SuggestCodingParams = BillCodingSuggestRequest;
export type CodingBudgetCheck = BillCodingBudgetCheck;

/** Minimal SCC row for public_id → numeric id mapping (lookups or entity list). */
export interface SccCatalogEntry {
  id: number;
  public_id: string;
}

export interface LineCodingFields {
  sub_cost_code_id: string;
  project_public_id: string;
  unresolved_project_id?: number;
  coding_prefill_state?: CodingPrefillState;
  coding_suggestion_reason?: string | null;
  coding_suggestion_confidence?: number | null;
  /** Set at prefill time — used to detect user overrides. */
  coding_suggested_sub_cost_code_id?: string;
  /** User edited this cell (including clear) — prefill must not touch it. */
  coding_scc_touched?: boolean;
}

let activeSuggestAbort: AbortController | null = null;

/** Test hook — abort in-flight suggest and clear controller. */
export function resetSuggestCodingForTests(): void {
  activeSuggestAbort?.abort();
  activeSuggestAbort = null;
}

export function parseConfidence(conf: number | string | null | undefined): number | null {
  if (conf == null) return null;
  if (typeof conf === "number") return Number.isFinite(conf) ? conf : null;
  const n = parseFloat(conf);
  return Number.isFinite(n) ? n : null;
}

/** Percent figure for display (handles 0–1 ratio or 0–100). */
export function confidenceDisplayPct(conf: number | null): number | null {
  if (conf == null) return null;
  return conf <= 1 ? Math.round(conf * 100) : Math.round(conf);
}

export function formatSuggestionBadgeLabel(conf: number | null): string {
  const pct = confidenceDisplayPct(conf);
  if (pct == null) return "Suggested";
  return `Suggested ${pct}%`;
}

/** Raw confidence on a 0–100 scale (unrounded). */
export function confidenceRawPct(conf: number | null): number | null {
  if (conf == null) return null;
  return conf <= 1 ? conf * 100 : conf;
}

export function isLowConfidence(conf: number | null): boolean {
  const raw = confidenceRawPct(conf);
  if (raw == null) return false;
  return raw < 60;
}

export function suggestionBadgeClassName(conf: number | null): string {
  const base = "status-badge coding-suggested";
  return isLowConfidence(conf) ? `${base} coding-suggested-low` : base;
}

const WELL_FORMED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Parse a decimal money string to integer cents; null if blank or invalid. */
export function decimalToCents(str: string | null | undefined): bigint | null {
  if (str == null) return null;
  const raw = str.trim();
  if (raw === "") return null;
  if (!WELL_FORMED_DECIMAL.test(raw)) return null;

  let sign = 1n;
  let s = raw;
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("-")) {
    sign = -1n;
    s = s.slice(1);
  }

  const dot = s.indexOf(".");
  const intPart = dot >= 0 ? s.slice(0, dot) : s;
  const fracPart = dot >= 0 ? s.slice(dot + 1) : "";
  // Exact cents only: a non-zero digit past the cents place is not a money amount.
  if (!/^0*$/.test(fracPart.slice(2))) return null;
  const cents = BigInt(intPart === "" ? "0" : intPart) * 100n + BigInt((fracPart + "00").slice(0, 2));
  return sign * cents;
}

/** Format integer cents as a fixed 2-decimal string (may be negative). */
export function centsToDecimal(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const dollars = abs / 100n;
  const frac = abs % 100n;
  return `${neg ? "-" : ""}${dollars.toString()}.${frac.toString().padStart(2, "0")}`;
}

function decimalAbsolute(decimal: string): string {
  const cents = decimalToCents(decimal);
  if (cents === null) return decimal.trim();
  return centsToDecimal(cents < 0n ? -cents : cents);
}

function formatUsdThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Display USD from a decimal string (sign stripped separately when needed). */
function formatUsdDecimalString(decimal: string): string {
  const abs = decimalAbsolute(decimal);
  const dot = abs.indexOf(".");
  const intPart = dot >= 0 ? abs.slice(0, dot) : abs;
  const fracPart = dot >= 0 ? abs.slice(dot + 1) : "00";
  return `$${formatUsdThousands(intPart)}.${fracPart.padEnd(2, "0").slice(0, 2)}`;
}

export interface CodingSuggestInputKey {
  vendor_public_id: string;
  memo: string;
  project_public_id: string;
  amount?: string;
}

export function buildCodingSuggestInputKey(parts: {
  vendor_public_id: string;
  memo: string;
  project_public_id: string | undefined;
  amount: string | undefined;
}): CodingSuggestInputKey {
  return {
    vendor_public_id: parts.vendor_public_id,
    memo: parts.memo.trim(),
    project_public_id: parts.project_public_id ?? "",
    ...(parts.amount != null ? { amount: parts.amount } : {}),
  };
}

export function serializeCodingSuggestKey(key: CodingSuggestInputKey): string {
  return JSON.stringify({
    v: key.vendor_public_id,
    m: key.memo,
    p: key.project_public_id,
    a: key.amount ?? null,
  });
}

export interface BillCodingBudgetSnapshot {
  key: string;
  budget_check: Exclude<CodingBudgetCheck, "no_project" | null | undefined>;
  budget_remaining: string | null;
  project_public_id: string;
  /** Numeric SCC option id mapped from the stored suggest response. */
  suggested_scc_option_id: string;
}

/**
 * A line this suggestion covers: on the hint project, and either an SCC the
 * suggestion can still fill (empty and not cleared by the user — a cleared cell
 * is never filled) or still holding the SCC it suggested (prefilled/accepted).
 * The same lines make up the request amount and the chip's coverage.
 */
export function lineCoveredByBudgetChip(
  line: LineCodingFields,
  projectHint: string,
): boolean {
  if (line.unresolved_project_id != null) return false;
  if (line.project_public_id !== projectHint) return false;
  if (line.sub_cost_code_id === "") return !line.coding_scc_touched;
  return (
    (line.coding_prefill_state === "prefilled" || line.coding_prefill_state === "accepted") &&
    line.coding_suggested_sub_cost_code_id === line.sub_cost_code_id
  );
}

export function coveredLinesMatchSuggestedScc<T extends LineCodingFields>(
  lines: T[],
  projectHint: string | undefined,
  suggestedSccOptionId: string,
): boolean {
  if (projectHint == null) return false;
  // An SCC the catalog could not map was never filled: the verdict is for a code no line carries.
  if (suggestedSccOptionId === "") return false;
  const covered = lines.filter((line) => lineCoveredByBudgetChip(line, projectHint));
  if (covered.length === 0) return false;
  return covered.every((line) => line.sub_cost_code_id === suggestedSccOptionId);
}

/** Bill-level budget chip when the stored response matches the current suggest inputs. */
export function billLevelBudgetChip(
  stored: BillCodingBudgetSnapshot | null,
  currentKey: string | null,
  projectHint: string | undefined,
  amount: string | undefined,
  lines: LineCodingFields[],
): { label: string; className: string } | null {
  if (stored == null || currentKey == null || stored.key !== currentKey) return null;
  if (amount == null) return null;
  if (projectHint == null || stored.project_public_id !== projectHint) return null;
  if (
    !coveredLinesMatchSuggestedScc(lines, projectHint, stored.suggested_scc_option_id)
  ) {
    return null;
  }
  return budgetChip(stored.budget_check, stored.budget_remaining);
}

export function budgetChip(
  check: CodingBudgetCheck | null | undefined,
  remaining: string | null | undefined,
): { label: string; className: string } | null {
  switch (check) {
    case "fits":
      return { label: "Within budget", className: "status-badge coding-budget-fits" };
    case "tight": {
      if (remaining == null || remaining === "") return null;
      return {
        label: `Tight: ${formatUsdDecimalString(remaining)} left`,
        className: "status-badge coding-budget-tight",
      };
    }
    case "over": {
      if (remaining == null || remaining === "") return null;
      return {
        label: `Over by ${formatUsdDecimalString(remaining)}`,
        className: "status-badge coding-budget-over",
      };
    }
    case "unbudgeted":
      return { label: "No budget line", className: "status-badge coding-budget-none" };
    case "no_budget":
      return { label: "No active budget", className: "status-badge coding-budget-none" };
    default:
      return null;
  }
}

/** Exact cents sum of the lines' amounts: blank counts 0, any invalid amount -> null (unknown). */
function sumAmountCents(lines: { amount?: string | null }[]): bigint | null {
  let sum = 0n;
  for (const line of lines) {
    if ((line.amount ?? "").trim() === "") continue;
    const cents = decimalToCents(line.amount);
    if (cents === null) return null;
    sum += cents;
  }
  return sum;
}

export function codingSuggestAmountFromLines<
  T extends LineCodingFields & { amount?: string | null },
>(lines: T[], projectHint: string | undefined): string | undefined {
  if (projectHint == null) return undefined;

  // The request amount is the sum of exactly the lines the chip covers.
  const eligible = lines.filter((line) => lineCoveredByBudgetChip(line, projectHint));
  if (eligible.length === 0) return undefined;

  const sumCents = sumAmountCents(eligible);
  if (sumCents === null || sumCents <= 0n) return undefined;
  return centsToDecimal(sumCents);
}

/**
 * Project hint derived from line projects when the user has not picked one:
 * every non-empty, accessible project must agree; empty-project lines are ignored.
 */
export function projectHintFromLines<
  T extends {
    project_public_id: string;
    unresolved_project_id?: number;
  },
>(lines: T[]): string | undefined {
  const withProject = lines.filter(
    (li) => li.project_public_id !== "" && li.unresolved_project_id == null,
  );
  if (withProject.length === 0) return undefined;
  const first = withProject[0].project_public_id;
  return withProject.every((li) => li.project_public_id === first) ? first : undefined;
}

/** When the suggestion names a project, only prefill SCC on matching or empty-project lines. */
export function lineEligibleForSuggestionScc(
  line: Pick<LineCodingFields, "project_public_id">,
  suggestionProjectPublicId: string,
): boolean {
  if (suggestionProjectPublicId === "") return true;
  if (line.project_public_id === "") return true;
  return line.project_public_id === suggestionProjectPublicId;
}

export function shouldTransitionCodingPrefillOnFieldEdit(
  state: CodingPrefillState | undefined,
  previousValue: string,
  newValue: string,
): boolean {
  return (
    (state === "prefilled" || state === "accepted") &&
    newValue !== previousValue
  );
}

export function applyUserCodingFieldChange<T extends LineCodingFields>(
  line: T,
  field: "sub_cost_code_id" | "project_public_id",
  newValue: string,
): T {
  const previousValue = line[field];
  const withValue =
    field === "sub_cost_code_id"
      ? ({ ...line, sub_cost_code_id: newValue, coding_scc_touched: true } as T)
      : ({ ...line, project_public_id: newValue } as T);
  let next = withValue;
  // Project is never prefilled from suggestions (r3-2) — only an SCC override drops prefilled/accepted.
  if (
    field === "sub_cost_code_id" &&
    shouldTransitionCodingPrefillOnFieldEdit(line.coding_prefill_state, previousValue, newValue)
  ) {
    next = {
      ...next,
      coding_prefill_state: nextPrefillState(line.coding_prefill_state, "user_edit"),
    };
  }
  return next;
}

const CODING_FIELDS = ["sub_cost_code_id", "project_public_id"] as const;

/**
 * Apply a user edit to a line: every patched field is set, and each coding field
 * in the patch goes through applyUserCodingFieldChange (touched flag + state),
 * chained so a patch carrying both coding fields keeps both transitions.
 */
export function applyUserLinePatch<T extends LineCodingFields>(line: T, patch: Partial<T>): T {
  let row = { ...line, ...patch } as T;
  for (const field of CODING_FIELDS) {
    const value = patch[field];
    if (typeof value === "string") {
      row = applyUserCodingFieldChange({ ...row, [field]: line[field] } as T, field, value);
    }
  }
  return row;
}

/** Accept a pre-filled line's suggestion; any other line is returned as-is. */
export function acceptPrefilled<T extends LineCodingFields>(line: T): T {
  return line.coding_prefill_state === "prefilled"
    ? { ...line, coding_prefill_state: "accepted" }
    : line;
}

function mapSccPublicIdToOptionId(
  publicId: string | null | undefined,
  catalog: SccCatalogEntry[],
): string {
  if (!publicId) return "";
  const row = catalog.find((s) => s.public_id === publicId);
  return row ? String(row.id) : "";
}

function suggestionIsEmpty(s: BillCodingSuggestion | null): s is null {
  return (
    s === null ||
    s.source === "none" ||
    (!s.sub_cost_code_public_id && !s.project_public_id)
  );
}

export function suggestedSccOptionIdFromResponse(
  suggestion: BillCodingSuggestion | null,
  catalog: SccCatalogEntry[],
): string {
  if (suggestionIsEmpty(suggestion)) return "";
  return mapSccPublicIdToOptionId(suggestion.sub_cost_code_public_id, catalog);
}

export function applySuggestionToLines<
  T extends LineCodingFields & { amount?: string | null },
>(
  lines: T[],
  /** null (no response) is applied like an empty suggestion — fills nothing. */
  suggestion: BillCodingSuggestion | null,
  sccCatalog: SccCatalogEntry[],
): T[] {
  const empty = suggestionIsEmpty(suggestion);
  const sccId = empty
    ? ""
    : mapSccPublicIdToOptionId(suggestion.sub_cost_code_public_id, sccCatalog);
  const projectId = empty ? "" : (suggestion.project_public_id ?? "");
  const conf = empty ? null : parseConfidence(suggestion.confidence);

  const canFillSccOnLine = (line: T): boolean => {
    if (empty || line.unresolved_project_id != null) return false;
    return (
      !line.coding_scc_touched &&
      line.sub_cost_code_id === "" &&
      sccId !== "" &&
      lineEligibleForSuggestionScc(line, projectId)
    );
  };

  const plans = lines.map((line) => canFillSccOnLine(line));

  let changed = false;
  const mapped = lines.map((line, i) => {
    const canFillScc = plans[i];
    if (!canFillScc) {
      return line;
    }

    changed = true;
    const next: T = { ...line };
    next.sub_cost_code_id = sccId;
    next.coding_suggested_sub_cost_code_id = sccId;
    if (next.coding_prefill_state !== "changed") {
      next.coding_prefill_state = "prefilled";
    }
    if (!empty) {
      next.coding_suggestion_reason = suggestion.reason;
      next.coding_suggestion_confidence = conf;
    }
    return next;
  });
  // Same array when nothing was filled, so React can skip the re-render.
  return changed ? mapped : lines;
}

export function nextPrefillState(
  prev: CodingPrefillState | undefined,
  action: "accept" | "user_edit",
): CodingPrefillState | undefined {
  if (prev === undefined) return undefined;
  if (action === "accept") {
    return prev === "prefilled" ? "accepted" : prev;
  }
  if (action === "user_edit") {
    if (prev === "prefilled" || prev === "accepted") return "changed";
    return prev;
  }
  return prev;
}

export function lineShowsSuggestionBadge(line: LineCodingFields): boolean {
  return line.coding_prefill_state === "prefilled" || line.coding_prefill_state === "accepted";
}

/** Badge on the SCC cell: the line carries a live suggestion and the cell still holds it. */
export function lineShowsSuggestionBadgeFor(line: LineCodingFields): boolean {
  return (
    lineShowsSuggestionBadge(line) &&
    line.coding_suggested_sub_cost_code_id === line.sub_cost_code_id &&
    line.sub_cost_code_id !== ""
  );
}

export async function suggestCoding(params: SuggestCodingParams): Promise<BillCodingSuggestion | null> {
  activeSuggestAbort?.abort();
  const ac = new AbortController();
  activeSuggestAbort = ac;

  const body: Record<string, unknown> = {
    vendor_public_id: params.vendor_public_id,
  };
  if (params.project_public_id) body.project_public_id = params.project_public_id;
  if (params.memo?.trim()) body.memo = params.memo.trim();
  if (params.bill_public_id) body.bill_public_id = params.bill_public_id;
  if (params.amount != null && params.amount !== "") body.amount = params.amount;

  try {
    const envelope = await rawRequest<{ data: BillCodingSuggestion }>(
      "/api/v1/bill/coding/suggest",
      {
        method: "POST",
        body: JSON.stringify(body),
        signal: ac.signal,
      },
    );
    if (activeSuggestAbort !== ac) return null;
    return envelope.data ?? null;
  } catch {
    // Abort, 404/422, network: a suggestion is optional, so every failure is "none".
    return null;
  } finally {
    if (activeSuggestAbort === ac) activeSuggestAbort = null;
  }
}
