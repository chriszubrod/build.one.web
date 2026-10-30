import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchWithRefresh = vi.fn();
vi.mock("../../../api/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../api/client")>();
  return { ...real, fetchWithRefresh: (...a: unknown[]) => fetchWithRefresh(...a) };
});

import { fetchCandidatePdf } from "./attachmentBackfillApi";

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
