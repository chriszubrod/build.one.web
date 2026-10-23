import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextDraftPathFromList } from "./draftQueue";

const mockGetList = vi.fn();

vi.mock("../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
}));

const LIST_PATH = "/api/v1/get/things?status=draft&page=1&page_size=2";
const FALLBACK = "/things/list?status=draft";

describe("nextDraftPathFromList", () => {
  beforeEach(() => {
    mockGetList.mockReset();
  });

  it("requests the draft list with page_size=2", async () => {
    mockGetList.mockResolvedValue({ data: [{ public_id: "a" }], count: 1 });
    await nextDraftPathFromList(
      { listPath: LIST_PATH, itemPath: (id) => `/thing/${id}`, fallbackPath: FALLBACK },
      "current",
    );
    expect(mockGetList).toHaveBeenCalledWith(LIST_PATH);
  });

  it("returns the first draft that is not the current one", async () => {
    mockGetList.mockResolvedValue({
      data: [{ public_id: "current" }, { public_id: "next" }],
      count: 2,
    });
    const path = await nextDraftPathFromList(
      { listPath: LIST_PATH, itemPath: (id) => `/thing/${id}`, fallbackPath: FALLBACK },
      "current",
    );
    expect(path).toBe("/thing/next");
  });

  it("returns the first row when it is not the current bill", async () => {
    mockGetList.mockResolvedValue({ data: [{ public_id: "only-other" }], count: 1 });
    const path = await nextDraftPathFromList(
      { listPath: LIST_PATH, itemPath: (id) => `/thing/${id}`, fallbackPath: FALLBACK },
      "current",
    );
    expect(path).toBe("/thing/only-other");
  });

  it("falls back when the list is empty", async () => {
    mockGetList.mockResolvedValue({ data: [], count: 0 });
    const path = await nextDraftPathFromList(
      { listPath: LIST_PATH, itemPath: (id) => `/thing/${id}`, fallbackPath: FALLBACK },
      "current",
    );
    expect(path).toBe(FALLBACK);
  });

  it("falls back when only the current draft remains", async () => {
    mockGetList.mockResolvedValue({ data: [{ public_id: "current" }], count: 1 });
    const path = await nextDraftPathFromList(
      { listPath: LIST_PATH, itemPath: (id) => `/thing/${id}`, fallbackPath: FALLBACK },
      "current",
    );
    expect(path).toBe(FALLBACK);
  });

  it("falls back when the list request fails", async () => {
    mockGetList.mockRejectedValue(new Error("network"));
    const path = await nextDraftPathFromList(
      { listPath: LIST_PATH, itemPath: (id) => `/thing/${id}`, fallbackPath: FALLBACK },
      "current",
    );
    expect(path).toBe(FALLBACK);
  });
});
