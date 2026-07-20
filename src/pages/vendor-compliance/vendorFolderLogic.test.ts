import { describe, expect, it } from "vitest";
import {
  folderFileShowsComplianceHint,
  folderFileSubtitle,
  importDocumentTypeCodes,
  IMPORT_DOCUMENT_TYPE_OPTIONS,
} from "./vendorFolderLogic";

describe("IMPORT_DOCUMENT_TYPE_OPTIONS", () => {
  it("lists exactly three compliance document types", () => {
    expect(IMPORT_DOCUMENT_TYPE_OPTIONS).toHaveLength(3);
    expect(importDocumentTypeCodes()).toEqual([
      "BUSINESS_LICENSE",
      "CONTRACTORS_LICENSE",
      "CERTIFICATE_OF_INSURANCE",
    ]);
  });

  it("does not include W-9", () => {
    const codes = importDocumentTypeCodes();
    const labels = IMPORT_DOCUMENT_TYPE_OPTIONS.map((o) => o.label);
    expect(codes).not.toContain("W9");
    expect(codes.some((c) => c.includes("W9"))).toBe(false);
    expect(labels.some((l) => /w-?9/i.test(l))).toBe(false);
  });
});

describe("folderFileSubtitle", () => {
  it("returns folder_path when present", () => {
    expect(
      folderFileSubtitle({
        graph_item_id: "1",
        name: "coi.pdf",
        folder_path: "Contracts/2024",
        compliance_hint: false,
      }),
    ).toBe("Contracts/2024");
  });

  it("returns undefined when folder_path is empty", () => {
    expect(
      folderFileSubtitle({
        graph_item_id: "1",
        name: "coi.pdf",
        folder_path: "",
        compliance_hint: false,
      }),
    ).toBeUndefined();
  });
});

describe("folderFileShowsComplianceHint", () => {
  it("returns true when compliance_hint is set", () => {
    expect(
      folderFileShowsComplianceHint({
        graph_item_id: "1",
        name: "coi.pdf",
        folder_path: "",
        compliance_hint: true,
      }),
    ).toBe(true);
  });

  it("returns false when compliance_hint is false", () => {
    expect(
      folderFileShowsComplianceHint({
        graph_item_id: "1",
        name: "coi.pdf",
        folder_path: "",
        compliance_hint: false,
      }),
    ).toBe(false);
  });
});
