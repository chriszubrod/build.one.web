import { describe, it, expect } from "vitest";
import type {
  AttachmentBackfillCandidate,
  AttachmentBackfillCandidateDetail,
  AttachmentBackfillFacet,
} from "../../../types/api";
import {
  approveBlockedReason,
  batchCount,
  defaultBatch,
  firstBatchIn,
  groupCounts,
  hasSample,
  sampleCount,
  sampleProgress,
} from "./backfillModel";

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

describe("b5 — sample facets", () => {
  const f = (
    evidence_group: AttachmentBackfillFacet["evidence_group"],
    review_status: AttachmentBackfillFacet["review_status"],
    count: number,
  ): AttachmentBackfillFacet => ({
    evidence_group,
    project_public_id: "p",
    project_name: "P",
    bill_year: 2024,
    review_status,
    count,
  });
  const facets = [
    f("clean", "pending", 10),
    f("clean", "approved", 4),
    f("flagged", "pending", 2),
    f("sample", "pending", 6),
    f("sample", "approved", 3),
    f("sample", "rejected", 1),
  ];

  it("groupCounts excludes sample rows, so a sum over groups never double-counts", () => {
    const all = groupCounts(facets, "all");
    expect(all).toEqual({ clean: 14, flagged: 2, invoice_only: 0, amount_only: 0, neither: 0 });
    expect(Object.values(all).reduce((a, b) => a + b, 0)).toBe(16);
    expect(groupCounts(facets, "pending").clean).toBe(10);
  });

  it("sampleProgress: decided = approved + rejected, total = every member", () => {
    expect(sampleProgress(facets)).toEqual({ decided: 4, total: 10 });
    expect(sampleProgress(facets.filter((x) => x.evidence_group !== "sample"))).toBeNull();
  });

  it("hasSample / sampleCount", () => {
    expect(hasSample(facets)).toBe(true);
    expect(hasSample([f("clean", "pending", 1)])).toBe(false);
    expect(sampleCount(facets, "pending")).toBe(6);
    expect(sampleCount(facets, "all")).toBe(10);
  });

  it("the sample's batch is flat: no project/year, counted over every sample row in the status", () => {
    const twoProjects = [...facets, { ...f("sample", "pending", 2), project_public_id: "q", bill_year: 2020 }];
    const sel = firstBatchIn(twoProjects, "sample", "pending");
    expect(sel).toEqual({ group: "sample", projectPublicId: null, year: null });
    expect(batchCount(twoProjects, sel!, "pending")).toBe(8);
    expect(batchCount(twoProjects, sel!, "all")).toBe(12);
    expect(firstBatchIn(facets.filter((x) => x.evidence_group !== "sample"), "sample", "pending")).toBeNull();
  });

  it("the default batch never opens on the sample", () => {
    expect(defaultBatch([f("sample", "pending", 3)], "pending")).toBeNull();
    expect(defaultBatch(facets, "pending")?.group).toBe("clean");
  });
});
