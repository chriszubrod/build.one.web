import type { DocumentHeaderFieldDef } from "../../components/DocumentHeaderFields";

export type VendorLookupRow = { public_id: string; name: string };

export function vendorSelectOptions(vendors: VendorLookupRow[] | undefined) {
  return (vendors ?? []).map((v) => ({ value: v.public_id, label: v.name }));
}

/** Vendor → Credit Number → Credit Date → Total Amount → Memo */
export function billCreditHeaderFields(
  vendorOptions: { value: string; label: string }[],
  mode: "create" | "edit",
): DocumentHeaderFieldDef[] {
  return [
    {
      key: "vendor_public_id",
      label: "Vendor",
      type: "select",
      options: vendorOptions,
      required: mode === "create",
    },
    { key: "credit_number", label: "Credit Number", type: "text", required: true },
    { key: "credit_date", label: "Credit Date", type: "date", required: true },
    { key: "total_amount", label: "Total Amount", type: "number" },
    { key: "memo", label: "Memo", type: "textarea", fullWidth: true },
  ];
}
