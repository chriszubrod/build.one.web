import { ApiError } from "../../api/client";

export const POSSIBLE_DUPLICATE_REASONS = [
  "vendor_date_amount",
  "same_document_text",
  "same_number_amount_date",
] as const;

export type PossibleDuplicateReason = (typeof POSSIBLE_DUPLICATE_REASONS)[number];

export class DuplicateDialogCancelled extends Error {
  constructor() {
    super("Duplicate check cancelled.");
    this.name = "DuplicateDialogCancelled";
  }
}

export interface PossibleDuplicateMatch {
  public_id: string;
  bill_number: string;
  bill_date: string;
  total_amount: string;
  status: string;
  vendor_name: string;
  project_names: string[];
  created_datetime: string;
  reasons: PossibleDuplicateReason[];
}

function isPossibleDuplicateReason(r: unknown): r is PossibleDuplicateReason {
  return (
    typeof r === "string" &&
    (POSSIBLE_DUPLICATE_REASONS as readonly string[]).includes(r)
  );
}

function parseMatches(raw: unknown): PossibleDuplicateMatch[] {
  if (!Array.isArray(raw)) return [];
  const out: PossibleDuplicateMatch[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.public_id !== "string") continue;
    out.push({
      public_id: row.public_id,
      bill_number: typeof row.bill_number === "string" ? row.bill_number : "",
      bill_date: typeof row.bill_date === "string" ? row.bill_date : "",
      total_amount:
        typeof row.total_amount === "string" ? row.total_amount : String(row.total_amount ?? ""),
      status: typeof row.status === "string" ? row.status : "",
      vendor_name: typeof row.vendor_name === "string" ? row.vendor_name : "",
      project_names: Array.isArray(row.project_names)
        ? row.project_names.filter((p): p is string => typeof p === "string")
        : [],
      created_datetime:
        typeof row.created_datetime === "string" ? row.created_datetime : "",
      reasons: Array.isArray(row.reasons)
        ? row.reasons.filter(isPossibleDuplicateReason)
        : [],
    });
  }
  return out;
}

export function possibleDuplicateFromError(
  err: unknown,
): { matches: PossibleDuplicateMatch[]; hiddenCount: number } | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status !== 422 || err.errorCode !== "possible_duplicate") return null;
  const body =
    err.body && typeof err.body === "object"
      ? (err.body as Record<string, unknown>)
      : {};
  const matches = parseMatches(body.duplicate_matches);
  const hiddenRaw = body.hidden_match_count;
  const hiddenCount =
    typeof hiddenRaw === "number" && Number.isFinite(hiddenRaw) ? hiddenRaw : 0;
  return { matches, hiddenCount };
}

export function confirmBody(matches: PossibleDuplicateMatch[]): {
  confirm_not_duplicate: true;
  confirmed_duplicate_public_ids: string[];
} {
  return {
    confirm_not_duplicate: true,
    confirmed_duplicate_public_ids: matches.map((m) => m.public_id),
  };
}
