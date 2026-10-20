import type { DocumentHeaderFieldDef } from "../../components/DocumentHeaderFields";

export type VendorLookupRow = { public_id: string; name: string };

export function vendorSelectOptions(vendors: VendorLookupRow[] | undefined) {
  return (vendors ?? []).map((v) => ({ value: v.public_id, label: v.name }));
}

/** Vendor → Reference Number → Expense Date → Total Amount → Memo → Is Credit */
export function expenseHeaderFields(
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
    {
      key: "reference_number",
      label: "Reference Number",
      type: "text",
      required: true,
    },
    { key: "expense_date", label: "Expense Date", type: "date", required: true },
    { key: "total_amount", label: "Total Amount", type: "number" },
    { key: "memo", label: "Memo", type: "textarea", fullWidth: true },
    { key: "is_credit", label: "Is Credit", type: "checkbox" },
  ];
}
