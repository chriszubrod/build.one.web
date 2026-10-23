import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextDraftPath } from "./billDraftQueue";
import type { Bill } from "../../types/api";

const mockGetList = vi.fn();

vi.mock("../../api/client", () => ({
  getList: (...args: unknown[]) => mockGetList(...args),
}));

function sampleBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 2,
    public_id: "bill-next",
    row_version: "rv",
    created_datetime: null,
    modified_datetime: null,
    vendor_id: 1,
    payment_term_id: 1,
    bill_date: null,
    due_date: "2026-02-15",
    bill_number: null,
    total_amount: null,
    memo: null,
    is_draft: true,
    intake_source: null,
    intake_source_detail: null,
    ...overrides,
  };
}

describe("billDraftQueue.nextDraftPath", () => {
  beforeEach(() => {
    mockGetList.mockReset();
  });

  it("opens the next draft on its edit page", async () => {
    mockGetList.mockResolvedValue({ data: [sampleBill()], count: 1 });
    await expect(nextDraftPath("bill-1")).resolves.toBe("/bill/bill-next/edit");
    expect(mockGetList).toHaveBeenCalledWith("/api/v1/get/bills?status=draft&page=1&page_size=2");
  });

  it("falls back to the Draft tab when no next draft exists", async () => {
    mockGetList.mockResolvedValue({ data: [], count: 0 });
    await expect(nextDraftPath("bill-1")).resolves.toBe("/bill/list?status=draft");
  });
});
