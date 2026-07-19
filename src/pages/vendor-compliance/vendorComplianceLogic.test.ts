import { describe, expect, it } from "vitest";
import { expiryHint, validityClass, validityLabel } from "./vendorComplianceLogic";

describe("validityClass", () => {
  it("maps known statuses to CSS modifiers", () => {
    expect(validityClass("valid")).toBe("valid");
    expect(validityClass("present")).toBe("valid");
    expect(validityClass("expiring")).toBe("expiring");
    expect(validityClass("expired")).toBe("expired");
    expect(validityClass("incomplete")).toBe("incomplete");
    expect(validityClass("missing")).toBe("missing");
  });

  it("falls back unknown statuses to missing", () => {
    expect(validityClass("unknown")).toBe("missing");
    expect(validityClass("")).toBe("missing");
  });
});

describe("validityLabel", () => {
  it("returns labels for known statuses", () => {
    expect(validityLabel("valid")).toBe("Valid");
    expect(validityLabel("expiring")).toBe("Expiring soon");
    expect(validityLabel("expired")).toBe("Expired");
    expect(validityLabel("incomplete")).toBe("Incomplete");
    expect(validityLabel("missing")).toBe("Missing");
    expect(validityLabel("present")).toBe("On file");
  });

  it("falls back unknown statuses to Missing", () => {
    expect(validityLabel("bogus")).toBe("Missing");
  });
});

describe("expiryHint", () => {
  it("returns empty for null or undefined", () => {
    expect(expiryHint(null)).toBe("");
    expect(expiryHint(undefined)).toBe("");
  });

  it("returns today for zero days", () => {
    expect(expiryHint(0)).toBe("today");
  });

  it("formats future days with singular and plural", () => {
    expect(expiryHint(1)).toBe("in 1 day");
    expect(expiryHint(12)).toBe("in 12 days");
  });

  it("formats past days with singular and plural", () => {
    expect(expiryHint(-1)).toBe("1 day ago");
    expect(expiryHint(-3)).toBe("3 days ago");
  });
});
