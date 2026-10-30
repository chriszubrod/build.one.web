import { ApiError, fetchWithRefresh, getList, getOne, post, rawRequest } from "../../../api/client";
import type {
  AttachmentBackfillCandidateDetail,
  AttachmentBackfillEvidenceGroup,
  AttachmentBackfillFacet,
  AttachmentBackfillQueuePage,
  AttachmentBackfillRejectReason,
  AttachmentBackfillReviewResult,
  AttachmentBackfillReviewStatus,
  AttachmentBackfillRun,
} from "../../../types/api";

/**
 * U-535b b3 — client for the b2 review API (build.one.api
 * entities/attachment_backfill/api/router.py). Every route is
 * require_system_admin; the page also gates on is_admin.
 */
const BASE = "/api/v1/admin/attachment-backfill";
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export const QUEUE_PAGE_SIZE = 50;

export async function listRuns(): Promise<AttachmentBackfillRun[]> {
  return (await getList<AttachmentBackfillRun>(`${BASE}/runs`)).data;
}

export async function getFacets(runPublicId: string): Promise<AttachmentBackfillFacet[]> {
  return (await getList<AttachmentBackfillFacet>(`${BASE}/runs/${encodeURIComponent(runPublicId)}/facets`)).data;
}

export interface QueueParams {
  group: AttachmentBackfillEvidenceGroup;
  /** Project PublicId, or null for candidates with no project (sent as `none`). */
  projectPublicId: string | null;
  /** Bill year, or null for candidates whose bill is gone (sent as `none`). */
  year: number | null;
  reviewStatus: AttachmentBackfillReviewStatus | "all";
  after?: string | null;
  limit?: number;
}

export async function getQueue(runPublicId: string, p: QueueParams): Promise<AttachmentBackfillQueuePage> {
  const q = new URLSearchParams();
  q.set("group", p.group);
  q.set("project_id", p.projectPublicId ?? "none");
  q.set("year", p.year == null ? "none" : String(p.year));
  q.set("review_status", p.reviewStatus);
  if (p.after) q.set("after", p.after);
  q.set("limit", String(p.limit ?? QUEUE_PAGE_SIZE));
  const res = await rawRequest<AttachmentBackfillQueuePage>(
    `${BASE}/runs/${encodeURIComponent(runPublicId)}/queue?${q.toString()}`,
  );
  return { data: res.data ?? [], count: res.count ?? 0, next_after: res.next_after ?? null };
}

export async function getCandidate(publicId: string): Promise<AttachmentBackfillCandidateDetail> {
  return getOne<AttachmentBackfillCandidateDetail>(`${BASE}/candidates/${encodeURIComponent(publicId)}`);
}

export interface CandidatePdf {
  blob: Blob;
  /**
   * The X-Content-Matches-Check header: true/false, or null for "unknown".
   * NOTE: cross-origin the browser only exposes this header if the API's CORS
   * config lists it in expose_headers; until then it reads as null and the page
   * relies on the detail's content_matches_check.
   */
  matches: boolean | null;
}

/**
 * GET the candidate PDF bytes with the authenticated client. Mirrors
 * client.ts `fetchViewAttachmentBlob` (Bearer + cookie + refresh) for this
 * route; a 401 surfaces as an ApiError rather than a login redirect.
 */
export async function fetchCandidatePdf(publicId: string): Promise<CandidatePdf> {
  const path = `${BASE}/candidates/${encodeURIComponent(publicId)}/pdf`;
  const res = await fetchWithRefresh(`${API_BASE}${path}`, () => {
    const token = localStorage.getItem("access_token");
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return { method: "GET", headers, credentials: "include" };
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ detail: res.statusText }))) as Record<string, unknown>;
    throw new ApiError(res.status, typeof body.detail === "string" ? body.detail : "Request failed", {
      errorCode: typeof body.error_code === "string" ? body.error_code : undefined,
      body,
    });
  }
  const header = res.headers.get("X-Content-Matches-Check");
  const matches = header === "true" ? true : header === "false" ? false : null;
  // Force the type: the iframe's PDF viewer keys off the blob type, not the bytes.
  return { blob: new Blob([await res.arrayBuffer()], { type: "application/pdf" }), matches };
}

export async function reviewCandidate(
  publicId: string,
  body: { decision: "approved"; row_version: string } | {
    decision: "rejected";
    reject_reason: AttachmentBackfillRejectReason;
    row_version: string;
  },
): Promise<AttachmentBackfillReviewResult> {
  return post<AttachmentBackfillReviewResult>(`${BASE}/candidates/${encodeURIComponent(publicId)}/review`, body);
}

export async function undoCandidate(publicId: string, rowVersion: string): Promise<AttachmentBackfillReviewResult> {
  return post<AttachmentBackfillReviewResult>(`${BASE}/candidates/${encodeURIComponent(publicId)}/undo`, {
    row_version: rowVersion,
  });
}
