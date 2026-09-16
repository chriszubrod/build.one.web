import { describe, it, expect } from "vitest";
import { serverDiverged } from "./serverDiverged";

/**
 * U-471 — the comparison the rebase gate is built on.
 *
 * Shallow `!==` over every key outside `owned`. A field wrongly left OUT of
 * `owned` makes this return true (refuse to rebase — degraded). A field
 * wrongly put INTO `owned` is invisible here (the dangerous direction);
 * `serverOwnedPickIsSafe` is the tripwire for that.
 */

const BASE = { memo: "hello", bill_number: "B-1", row_version: "v1", is_draft: true };
const OWNED = ["row_version", "is_draft"] as const;

describe("serverDiverged", () => {
  it("is false when only owned keys moved", () => {
    expect(serverDiverged(BASE, { ...BASE, row_version: "v2", is_draft: false }, OWNED)).toBe(false);
  });

  it("is true when a non-owned key moved", () => {
    expect(serverDiverged(BASE, { ...BASE, memo: "other editor", row_version: "v2" }, OWNED)).toBe(true);
  });

  it("is false when the projections are identical", () => {
    expect(serverDiverged(BASE, { ...BASE }, OWNED)).toBe(false);
  });

  it("treats a key present on only one side as a divergence", () => {
    expect(serverDiverged(BASE, { row_version: "v1", is_draft: true, memo: "hello" }, OWNED)).toBe(true);
  });

  it("does not consult owned keys even when they disagree", () => {
    const fresh = { memo: "hello", bill_number: "B-1", row_version: "TOTALLY-DIFFERENT", is_draft: false };
    expect(serverDiverged(BASE, fresh, OWNED)).toBe(false);
  });
});
