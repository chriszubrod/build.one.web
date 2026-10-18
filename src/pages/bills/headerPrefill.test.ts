import { describe, it, expect } from "vitest";
import {
  acceptAllHeaderPrefill,
  acceptHeaderPrefillField,
  applyHeaderPrefillValue,
  createEmptyHeaderPrefill,
  headersHaveUnreviewedPrefill,
  markHeaderUserEdit,
  revertUnacceptedHeaderPrefill,
} from "./headerPrefill";

describe("headerPrefill", () => {
  it("fills empty header fields and tracks prefilled state", () => {
    let meta = createEmptyHeaderPrefill();
    const form = { vendor_public_id: "", bill_number: "", bill_date: "" };
    const applied = applyHeaderPrefillValue(meta, form, "bill_number", "INV-1");
    expect(applied).not.toBeNull();
    meta = applied!.meta;
    expect(applied!.form.bill_number).toBe("INV-1");
    expect(meta.bill_number?.state).toBe("prefilled");
    expect(headersHaveUnreviewedPrefill(meta)).toBe(true);
  });

  it("does not overwrite non-empty or user-changed fields", () => {
    let meta = createEmptyHeaderPrefill();
    const form = { vendor_public_id: "v-user", bill_number: "", bill_date: "" };
    expect(applyHeaderPrefillValue(meta, form, "vendor_public_id", "v-file")).toBeNull();
    meta = { vendor_public_id: { state: "prefilled", value: "v-file" } };
    meta = markHeaderUserEdit(meta, "vendor_public_id");
    expect(meta.vendor_public_id?.state).toBe("changed");
    expect(
      applyHeaderPrefillValue(meta, { ...form, vendor_public_id: "v-file" }, "vendor_public_id", "v-other"),
    ).toBeNull();
  });

  it("accept-all and revert unaccepted prefills", () => {
    let meta = createEmptyHeaderPrefill();
    meta = {
      ...meta,
      bill_number: { state: "prefilled", value: "A" },
      bill_date: { state: "prefilled", value: "2026-01-01" },
    };
    meta = acceptHeaderPrefillField(meta, "bill_number");
    meta = acceptAllHeaderPrefill(meta);
    expect(headersHaveUnreviewedPrefill(meta)).toBe(false);

    const reverted = revertUnacceptedHeaderPrefill(
      { bill_number: { state: "prefilled", value: "X" } },
      { vendor_public_id: "", bill_number: "X", bill_date: "" },
    );
    expect(reverted.form.bill_number).toBe("");
    expect(reverted.meta.bill_number).toBeUndefined();
  });
});
