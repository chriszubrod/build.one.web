import { describe, it, expect } from "vitest";
import type { AttachmentBackfillCandidate, AttachmentBackfillCandidateDetail } from "../../../types/api";
import { approveBlockedReason } from "./backfillModel";

const row = {
  public_id: "c1",
  row_version: "rv",
  run_status: "ready",
  bill_public_id: "b1",
  review_status: "pending",
  linked: false,
} as AttachmentBackfillCandidate;
const detail = { ...row, snippets: [], snippet_error: null, content_matches_check: true } as AttachmentBackfillCandidateDetail;
const gate = (o: Partial<Parameters<typeof approveBlockedReason>[0]> = {}) =>
  approveBlockedReason({ row, detail, pdfLoaded: true, pdfMatches: true, viewerOff: false, ...o });

describe("approveBlockedReason — viewer-off precedence (Pass 2 #1)", () => {
  it("is null when everything is in place (control)", () => {
    expect(gate()).toBeNull();
  });

  it("reports the viewer being off, whether or not the PDF loaded", () => {
    expect(gate({ viewerOff: true })).toBe("Built-in PDF viewer is off");
    expect(gate({ viewerOff: true, pdfLoaded: false })).toBe("Built-in PDF viewer is off");
  });

  it("ranks after every row/evidence reason", () => {
    expect(gate({ viewerOff: true, detail: undefined })).toBe("Loading");
    expect(gate({ viewerOff: true, pdfMatches: false })).toBe("File changed in Box");
    expect(gate({ viewerOff: true, row: { ...row, bill_public_id: null } })).toBe("Bill no longer exists");
    expect(gate({ viewerOff: true, row: { ...row, linked: true } })).toBe("Already linked");
    expect(gate({ viewerOff: true, row: { ...row, review_status: "approved" } })).toBe("Already reviewed");
    expect(gate({ viewerOff: true, row: { ...row, run_status: "applied" } })).toBe("Run not open for review");
  });

  it("without the viewer flag an unloaded PDF still blocks", () => {
    expect(gate({ pdfLoaded: false })).toBe("Document not loaded");
  });
});
