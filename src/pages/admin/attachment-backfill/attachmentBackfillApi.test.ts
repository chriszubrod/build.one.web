import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchWithRefresh = vi.fn();
const rawRequest = vi.fn();
vi.mock("../../../api/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../api/client")>();
  return {
    ...real,
    fetchWithRefresh: (...a: unknown[]) => fetchWithRefresh(...a),
    rawRequest: (...a: unknown[]) => rawRequest(...a),
  };
});

import { fetchCandidatePdf, getQueue } from "./attachmentBackfillApi";

function pdfResponse(header: string | null, contentType = "application/octet-stream") {
  const headers: Record<string, string> = { "Content-Type": contentType };
  if (header !== null) headers["X-Content-Matches-Check"] = header;
  return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), { status: 200, headers });
}

beforeEach(() => fetchWithRefresh.mockReset());

describe("fetchCandidatePdf (fix 7 / fix 9)", () => {
  it("forces the blob type to application/pdf whatever the response says", async () => {
    fetchWithRefresh.mockResolvedValue(pdfResponse("true"));
    const { blob } = await fetchCandidatePdf("c1");
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(5);
  });

  it.each([
    ["true", true],
    ["false", false],
    ["unknown", null],
    [null, null],
  ] as const)("header %s -> matches %s", async (header, expected) => {
    fetchWithRefresh.mockResolvedValue(pdfResponse(header));
    expect((await fetchCandidatePdf("c1")).matches).toBe(expected);
  });
});

describe("getQueue — b5 sample is one flat list", () => {
  beforeEach(() => {
    rawRequest.mockReset();
    rawRequest.mockResolvedValue({ data: [], count: 0, next_after: null });
  });
  const params = () => new URL(`http://x${rawRequest.mock.calls[0][0] as string}`).searchParams;

  it("group=sample sends only group + review_status (+ limit), never project_id or year", async () => {
    await getQueue("run-1", { group: "sample", projectPublicId: "p-1", year: 2023, reviewStatus: "all" });
    const p = params();
    expect(p.get("group")).toBe("sample");
    expect(p.get("review_status")).toBe("all");
    expect(p.has("project_id")).toBe(false);
    expect(p.has("year")).toBe(false);
  });

  it("an evidence group still sends project_id and year, with `none` for nulls (control)", async () => {
    await getQueue("run-1", { group: "clean", projectPublicId: null, year: null, reviewStatus: "pending" });
    const p = params();
    expect(p.get("group")).toBe("clean");
    expect(p.get("project_id")).toBe("none");
    expect(p.get("year")).toBe("none");
  });
});
