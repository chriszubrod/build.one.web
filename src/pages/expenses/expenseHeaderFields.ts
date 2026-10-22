import type { DocumentHeaderFieldDef } from "../../components/DocumentHeaderFields";
import type { ComboboxOption } from "../../components/ui/comboboxFilter";

/** Vendor → Reference Number → Expense Date → Total Amount → Memo → Is Credit */
export function expenseHeaderFields(
  vendorOptions: ComboboxOption[],
  mode: "create" | "edit",
): DocumentHeaderFieldDef[] {
  return [
    {
      key: "vendor_public_id",
      label: "Vendor",
      type: "combobox",
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
