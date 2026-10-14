import { rawRequest } from "../../api/client";
import type {
  BillCodingSuggestRequest,
  BillCodingSuggestResponse,
  BillLineCodingPrefillState,
} from "../../types/api";

// Wire types live in types/api.ts; these are the page-side names for them.
export type CodingPrefillState = BillLineCodingPrefillState;
export type BillCodingSuggestion = BillCodingSuggestResponse;
export type BillCodingSuggestionSource = BillCodingSuggestResponse["source"];
export type SuggestCodingParams = BillCodingSuggestRequest;

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
  coding_suggested_project_public_id?: string;
  /** User edited this cell (including clear) — prefill must not touch it. */
  coding_scc_touched?: boolean;
  coding_project_touched?: boolean;
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

/**
 * Project hint for coding suggest when empty-SCC lines share one visible project.
 * Skips inaccessible projects (unresolved_project_id).
 */
export function projectHintFromEmptySccLines<
  T extends {
    sub_cost_code_id: string;
    project_public_id: string;
    unresolved_project_id?: number;
  },
>(lines: T[]): string | undefined {
  const targets = lines.filter(
    (li) => li.sub_cost_code_id === "" && li.unresolved_project_id == null,
  );
  if (targets.length === 0) return undefined;
  const projectIds = targets
    .map((li) => li.project_public_id)
    .filter((p) => p !== "");
  if (projectIds.length === 0) return undefined;
  const first = projectIds[0];
  return projectIds.every((p) => p === first) ? first : undefined;
}

export function markLineCodingTouched<T extends LineCodingFields>(
  line: T,
  field: "sub_cost_code_id" | "project_public_id",
): T {
  if (field === "sub_cost_code_id") {
    return { ...line, coding_scc_touched: true };
  }
  return { ...line, coding_project_touched: true };
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
      ? ({ ...line, sub_cost_code_id: newValue } as T)
      : ({ ...line, project_public_id: newValue } as T);
  let next = markLineCodingTouched(withValue, field);
  if (shouldTransitionCodingPrefillOnFieldEdit(line.coding_prefill_state, previousValue, newValue)) {
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

function suggestionIsEmpty(s: BillCodingSuggestion): boolean {
  return (
    s.source === "none" ||
    (!s.sub_cost_code_public_id && !s.project_public_id)
  );
}

export function applySuggestionToLines<T extends LineCodingFields>(
  lines: T[],
  suggestion: BillCodingSuggestion,
  sccCatalog: SccCatalogEntry[],
): T[] {
  if (suggestionIsEmpty(suggestion)) return lines;

  const sccId = mapSccPublicIdToOptionId(suggestion.sub_cost_code_public_id, sccCatalog);
  const projectId = suggestion.project_public_id ?? "";
  const conf = parseConfidence(suggestion.confidence);

  let changed = false;
  const mapped = lines.map((line) => {
    if (line.unresolved_project_id != null) return line;

    const canFillScc =
      !line.coding_scc_touched &&
      line.sub_cost_code_id === "" &&
      sccId !== "" &&
      lineEligibleForSuggestionScc(line, projectId);
    const canFillProject =
      !line.coding_project_touched &&
      line.project_public_id === "" &&
      projectId !== "";
    if (!canFillScc && !canFillProject) return line;

    changed = true;
    const next: T = { ...line };
    if (canFillScc) {
      next.sub_cost_code_id = sccId;
      next.coding_suggested_sub_cost_code_id = sccId;
    }
    if (canFillProject) {
      next.project_public_id = projectId;
      next.coding_suggested_project_public_id = projectId;
    }
    if (next.coding_prefill_state !== "changed") {
      next.coding_prefill_state = "prefilled";
    }
    next.coding_suggestion_reason = suggestion.reason;
    next.coding_suggestion_confidence = conf;
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

/** Badge on one coding cell: the line carries a live suggestion and the cell still holds it. */
export function lineShowsSuggestionBadgeFor(
  line: LineCodingFields,
  field: (typeof CODING_FIELDS)[number],
): boolean {
  const suggested =
    field === "sub_cost_code_id"
      ? line.coding_suggested_sub_cost_code_id
      : line.coding_suggested_project_public_id;
  return lineShowsSuggestionBadge(line) && suggested === line[field] && line[field] !== "";
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
