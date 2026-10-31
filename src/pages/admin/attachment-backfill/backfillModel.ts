import type {
  AttachmentBackfillCandidate,
  AttachmentBackfillCandidateDetail,
  AttachmentBackfillEvidenceGroup,
  AttachmentBackfillFacet,
  AttachmentBackfillQueueGroup,
  AttachmentBackfillRejectReason,
  AttachmentBackfillReviewStatus,
  AttachmentBackfillRun,
  AttachmentBackfillSnippetKind,
} from "../../../types/api";

/**
 * U-535b b3 — pure helpers for the review page. Every label here is NEUTRAL:
 * it describes what was counted, never a conclusion about the link (the owner
 * decides every candidate himself). The spec asserts the rendered page carries
 * none of the verdict words.
 */

/** Same order as review.py EVIDENCE_GROUPS. */
export const EVIDENCE_GROUPS: AttachmentBackfillEvidenceGroup[] = [
  "clean",
  "flagged",
  "invoice_only",
  "amount_only",
  "neither",
];

export const GROUP_LABELS: Record<AttachmentBackfillEvidenceGroup, string> = {
  clean: "Invoice # and amount found, no other invoice numbers",
  flagged: "Other invoice numbers or statement layout",
  invoice_only: "Invoice # only",
  amount_only: "Amount only",
  neither: "Neither / not checked",
};

/**
 * b5: the queue filter for the run's OPEN random review sample. Not an evidence
 * group — facets count each member a second time (also in its real group), so
 * it never enters an "all groups" total (groupCounts) or the default batch.
 */
export const SAMPLE_GROUP = "sample" as const;
export const SAMPLE_LABEL = "Random sample";

/** Index i is the reason for key `${i + 1}`. Same set as review.py REJECT_REASONS. */
export const REJECT_REASONS: { value: AttachmentBackfillRejectReason; label: string }[] = [
  { value: "wrong_bill", label: "Wrong bill" },
  { value: "statement", label: "Statement" },
  { value: "multiple_invoices", label: "Multiple invoices" },
  { value: "duplicate", label: "Duplicate" },
  { value: "unreadable", label: "Unreadable" },
  { value: "other", label: "Other" },
];

export const SNIPPET_KIND_LABELS: Record<AttachmentBackfillSnippetKind, string> = {
  invoice_number: "Invoice #",
  amount: "Amount",
  vendor: "Vendor name",
  other_invoice_label: "Other invoice numbers",
};

export const SNIPPET_KIND_ORDER: AttachmentBackfillSnippetKind[] = [
  "invoice_number",
  "amount",
  "vendor",
  "other_invoice_label",
];

/** Refusal codes from b2's review/undo, in plain words. */
const REFUSAL_MESSAGES: Record<string, string> = {
  not_found: "This candidate no longer exists",
  run_not_ready: "This run is not open for review",
  bill_missing: "The bill no longer exists",
  bill_claimed_elsewhere: "This bill is claimed by another run",
  linked: "This candidate is already linked",
  not_pending: "This candidate was already reviewed",
  not_reviewed: "This candidate has no decision to undo",
  stale: "This candidate changed since it was loaded",
  invalid: "The request was not accepted",
};

export function refusalMessage(code: string | undefined): string {
  if (code && REFUSAL_MESSAGES[code]) return REFUSAL_MESSAGES[code];
  return code ? `Refused (${code})` : "Request failed";
}


// ── batch selection ─────────────────────────────────────────────────────

export interface BatchSelection {
  /** An evidence group, or SAMPLE_GROUP (its facets rows carry project/year/status like any group). */
  group: AttachmentBackfillQueueGroup;
  projectPublicId: string | null;
  year: number | null;
  /** Display name captured when picked, so the held project stays named after it empties. */
  projectName?: string;
}

export interface ProjectOption {
  projectPublicId: string | null;
  projectName: string;
  count: number;
}

export interface YearOption {
  year: number | null;
  count: number;
}

function statusMatches(
  facet: AttachmentBackfillFacet,
  status: AttachmentBackfillReviewStatus | "all",
): boolean {
  return status === "all" || facet.review_status === status;
}

/**
 * Per-evidence-group counts. `sample` rows are EXCLUDED: their members are
 * already counted in their real group (`clean`), so summing these never
 * double-counts. The sample's own count is sampleCount.
 */
export function groupCounts(
  facets: AttachmentBackfillFacet[],
  status: AttachmentBackfillReviewStatus | "all",
): Record<AttachmentBackfillEvidenceGroup, number> {
  const out = { clean: 0, flagged: 0, invoice_only: 0, amount_only: 0, neither: 0 };
  for (const f of facets) {
    const g = f.evidence_group;
    if (g && g !== SAMPLE_GROUP && statusMatches(f, status)) out[g] += f.count;
  }
  return out;
}

/**
 * b5 (EM decision): the open sample is ONE flat list — no project or year. The
 * nulls here are never sent (getQueue omits project_id/year for `sample`).
 */
export function sampleBatch(): BatchSelection {
  return { group: SAMPLE_GROUP, projectPublicId: null, year: null };
}

export function isSampleBatch(
  sel: BatchSelection | null | undefined,
): sel is BatchSelection & { group: typeof SAMPLE_GROUP } {
  return sel?.group === SAMPLE_GROUP;
}

/** True when the facets carry any `sample` row (the run has an open sample). */
export function hasSample(facets: AttachmentBackfillFacet[]): boolean {
  return facets.some((f) => f.evidence_group === SAMPLE_GROUP);
}

/** Sample members in the given status. */
export function sampleCount(
  facets: AttachmentBackfillFacet[],
  status: AttachmentBackfillReviewStatus | "all",
): number {
  let n = 0;
  for (const f of facets) if (f.evidence_group === SAMPLE_GROUP && statusMatches(f, status)) n += f.count;
  return n;
}

/** The open sample's progress: decided = approved + rejected; total = every member. Null when there is no sample. */
export function sampleProgress(facets: AttachmentBackfillFacet[]): { decided: number; total: number } | null {
  if (!hasSample(facets)) return null;
  let decided = 0;
  let total = 0;
  for (const f of facets) {
    if (f.evidence_group !== SAMPLE_GROUP) continue;
    total += f.count;
    if (f.review_status === "approved" || f.review_status === "rejected") decided += f.count;
  }
  return { decided, total };
}

/** Projects in a group, by name (no-project last), with counts > 0. */
export function projectOptions(
  facets: AttachmentBackfillFacet[],
  group: AttachmentBackfillQueueGroup,
  status: AttachmentBackfillReviewStatus | "all",
): ProjectOption[] {
  const byKey = new Map<string, ProjectOption>();
  for (const f of facets) {
    if (f.evidence_group !== group || !statusMatches(f, status) || f.count <= 0) continue;
    const key = f.project_public_id ?? "";
    const prev = byKey.get(key);
    if (prev) prev.count += f.count;
    else
      byKey.set(key, {
        projectPublicId: f.project_public_id,
        projectName: f.project_public_id ? f.project_name || "(unnamed project)" : "No project",
        count: f.count,
      });
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.projectPublicId === null) return 1;
    if (b.projectPublicId === null) return -1;
    return a.projectName.localeCompare(b.projectName);
  });
}

/** Years for a group + project, ascending (bill gone = null, last), counts > 0. */
export function yearOptions(
  facets: AttachmentBackfillFacet[],
  group: AttachmentBackfillQueueGroup,
  projectPublicId: string | null,
  status: AttachmentBackfillReviewStatus | "all",
): YearOption[] {
  const byYear = new Map<number | null, number>();
  for (const f of facets) {
    if (f.evidence_group !== group || f.project_public_id !== projectPublicId) continue;
    if (!statusMatches(f, status) || f.count <= 0) continue;
    byYear.set(f.bill_year, (byYear.get(f.bill_year) ?? 0) + f.count);
  }
  return [...byYear.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => {
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return a.year - b.year;
    });
}

/** First project + first year of a group (null when the group has nothing). */
export function firstBatchIn(
  facets: AttachmentBackfillFacet[],
  group: AttachmentBackfillQueueGroup,
  status: AttachmentBackfillReviewStatus | "all",
): BatchSelection | null {
  if (group === SAMPLE_GROUP) return sampleCount(facets, status) > 0 ? sampleBatch() : null;
  const project = projectOptions(facets, group, status)[0];
  if (!project) return null;
  const year = yearOptions(facets, group, project.projectPublicId, status)[0];
  if (!year) return null;
  return { group, projectPublicId: project.projectPublicId, year: year.year, projectName: project.projectName };
}

/**
 * Owner decision (Gate 1): the queue opens on the `clean` group, its first
 * project and that project's first year. Only when `clean` has nothing in the
 * chosen status does it fall to the next group in EVIDENCE_GROUPS order.
 */
export function defaultBatch(
  facets: AttachmentBackfillFacet[],
  status: AttachmentBackfillReviewStatus | "all",
): BatchSelection | null {
  for (const group of EVIDENCE_GROUPS) {
    const sel = firstBatchIn(facets, group, status);
    if (sel) return sel;
  }
  return null;
}

/** `options` plus the held project (count 0) when it has dropped out of them. */
export function withHeldProject(
  options: ProjectOption[],
  held: BatchSelection,
  facets: AttachmentBackfillFacet[],
): ProjectOption[] {
  if (options.some((o) => o.projectPublicId === held.projectPublicId)) return options;
  const name = held.projectName
    ? held.projectName
    : held.projectPublicId
    ? facets.find((f) => f.project_public_id === held.projectPublicId)?.project_name || "(unnamed project)"
    : "No project";
  return [...options, { projectPublicId: held.projectPublicId, projectName: name, count: 0 }];
}

/** `options` plus the held year (count 0) when it has dropped out of them. */
export function withHeldYear(options: YearOption[], held: BatchSelection): YearOption[] {
  if (options.some((o) => o.year === held.year)) return options;
  return [...options, { year: held.year, count: 0 }];
}

export function batchCount(
  facets: AttachmentBackfillFacet[],
  sel: BatchSelection,
  status: AttachmentBackfillReviewStatus | "all",
): number {
  if (isSampleBatch(sel)) return sampleCount(facets, status);
  return yearOptions(facets, sel.group, sel.projectPublicId, status).find((y) => y.year === sel.year)?.count ?? 0;
}

export function defaultRun(runs: AttachmentBackfillRun[]): AttachmentBackfillRun | undefined {
  return runs.find((r) => r.status === "ready") ?? runs[0];
}

// ── candidate gating ────────────────────────────────────────────────────

/** True when Box served different bytes from the ones the check read. */
export function contentChanged(
  detail: AttachmentBackfillCandidateDetail | undefined,
  pdfMatches: boolean | null | undefined,
): boolean {
  if (!detail) return false;
  return (
    detail.content_matches_check === false ||
    detail.snippet_error === "content_changed" ||
    pdfMatches === false
  );
}

export const PDF_VIEWER_OFF_REASON = "Built-in PDF viewer is off";

export function billGone(row: Pick<AttachmentBackfillCandidate, "bill_public_id">): boolean {
  return row.bill_public_id == null;
}

/**
 * Why Approve is unavailable for this candidate, or null when it may be sent.
 * The owner must have the evidence and the document in front of him: no
 * Approve before the detail AND the PDF have loaded.
 */
export function approveBlockedReason(args: {
  row: AttachmentBackfillCandidate;
  detail: AttachmentBackfillCandidateDetail | undefined;
  pdfLoaded: boolean;
  pdfMatches: boolean | null | undefined;
  /**
   * `navigator.pdfViewerEnabled === false`: the browser downloads PDFs instead of
   * showing them, so the document can never be on screen — fail safe, with the
   * reason said rather than a silent "not loaded".
   */
  viewerOff?: boolean;
}): string | null {
  const { row, detail, pdfLoaded, pdfMatches, viewerOff } = args;
  if (!detail) return "Loading";
  if (contentChanged(detail, pdfMatches)) return "File changed in Box";
  if (billGone(detail) || billGone(row)) return "Bill no longer exists";
  if (row.linked) return "Already linked";
  if (row.review_status !== "pending") return "Already reviewed";
  if (row.run_status && row.run_status !== "ready") return "Run not open for review";
  if (viewerOff) return PDF_VIEWER_OFF_REASON;
  if (!pdfLoaded) return "Document not loaded";
  return null;
}

// ── display formatting ──────────────────────────────────────────────────

export function formatCount(value: number | null | undefined): string {
  return value == null ? "—" : String(value);
}

export function formatFlag(value: boolean | null | undefined): string {
  return value == null ? "—" : value ? "yes" : "no";
}

export function formatMoney(value: string | null | undefined): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatBytes(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/** True when keyboard shortcuts must stay out of the way (typing in a field). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable;
}
