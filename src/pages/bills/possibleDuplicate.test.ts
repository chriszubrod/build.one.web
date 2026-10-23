import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { confirmBody, possibleDuplicateFromError } from "./possibleDuplicate";

describe("possibleDuplicate helpers", () => {
  it("returns null for non-422 or other error codes", () => {
    expect(possibleDuplicateFromError(new ApiError(400, "nope"))).toBeNull();
    expect(
      possibleDuplicateFromError(
        new ApiError(422, "x", { errorCode: "other", body: {} }),
      ),
    ).toBeNull();
  });

  it("parses matches and hidden count from ApiError body", () => {
    const err = new ApiError(422, "dup", {
      errorCode: "possible_duplicate",
      body: {
        duplicate_matches: [
          {
            public_id: "a",
            bill_number: "1",
            bill_date: "2026-01-01",
            total_amount: "10.00",
            status: "draft",
            vendor_name: "V",
            project_names: ["P"],
            created_datetime: "",
            reasons: ["same_document_text", "same_number_amount_date"],
          },
        ],
        hidden_match_count: 3,
      },
    });
    const parsed = possibleDuplicateFromError(err);
    expect(parsed?.matches).toHaveLength(1);
    expect(parsed?.matches[0].public_id).toBe("a");
    expect(parsed?.hiddenCount).toBe(3);
    expect(parsed?.matches[0].reasons).toEqual(["same_document_text", "same_number_amount_date"]);
  });

  it("confirmBody lists every visible match public id", () => {
    expect(
      confirmBody([
        { public_id: "x", bill_number: "", bill_date: "", total_amount: "", status: "", vendor_name: "", project_names: [], created_datetime: "", reasons: [] },
        { public_id: "y", bill_number: "", bill_date: "", total_amount: "", status: "", vendor_name: "", project_names: [], created_datetime: "", reasons: [] },
      ]),
    ).toEqual({
      confirm_not_duplicate: true,
      confirmed_duplicate_public_ids: ["x", "y"],
    });
  });
});
