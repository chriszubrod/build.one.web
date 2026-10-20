import type { ReactNode } from "react";
import DocumentHeaderFields, {
  type DocumentHeaderFieldDef,
} from "../../components/DocumentHeaderFields";
import {
  billEditFilePrefillAdornment,
  type HeaderFormSlice,
} from "./filePrefillLabels";
import type { BillIntakePrediction } from "../../types/api";

export interface BillHeaderFormValues {
  vendor_public_id: string;
  payment_term_public_id: string;
  bill_date: string;
  due_date?: string;
  bill_number: string;
  memo: string;
  is_draft?: boolean;
}

export interface BillHeaderFieldsProps {
  form: BillHeaderFormValues;
  onChange: (name: string, value: string) => void;
  vendorOptions: { value: string; label: string }[];
  paymentTermOptions: { value: string; label: string }[];
  mode: "create" | "edit";
  /** Create: file-read prefill badges */
  createHeaderAdornment?: (field: "vendor_public_id" | "bill_number" | "bill_date") => ReactNode;
  /** Edit: intake prediction badges */
  intakePrediction?: BillIntakePrediction | null;
  formForPrefill?: HeaderFormSlice | null;
}

/**
 * Shared bill header field block — Vendor → Bill Number → Bill Date → Payment Term → Memo.
 * Due Date is not shown; Edit syncs due_date to bill_date on bill date change (U-681).
 */
export default function BillHeaderFields({
  form,
  onChange,
  vendorOptions,
  paymentTermOptions,
  mode,
  createHeaderAdornment,
  intakePrediction,
  formForPrefill,
}: BillHeaderFieldsProps) {
  const required = mode === "create" || !form.is_draft;

  const handleChange = (name: string, value: string | boolean) => {
    if (typeof value !== "string") return;
    if (name === "bill_date" && mode === "edit") {
      onChange("bill_date", value);
      onChange("due_date", value);
      return;
    }
    onChange(name, value);
  };

  const editAdornment = (field: "vendor_public_id" | "bill_number" | "bill_date") =>
    mode === "edit"
      ? billEditFilePrefillAdornment(intakePrediction ?? null, formForPrefill ?? null, field)
      : null;

  const fields: DocumentHeaderFieldDef[] = [
    {
      key: "vendor_public_id",
      label: "Vendor",
      type: "select",
      options: vendorOptions,
      required: mode === "create",
      adornment:
        mode === "create"
          ? createHeaderAdornment?.("vendor_public_id")
          : editAdornment("vendor_public_id"),
    },
    {
      key: "bill_number",
      label: "Bill Number",
      type: "text",
      required,
      adornment:
        mode === "create"
          ? createHeaderAdornment?.("bill_number")
          : editAdornment("bill_number"),
    },
    {
      key: "bill_date",
      label: "Bill Date",
      type: "date",
      required,
      adornment:
        mode === "create"
          ? createHeaderAdornment?.("bill_date")
          : editAdornment("bill_date"),
    },
    {
      key: "payment_term_public_id",
      label: "Payment Term",
      type: "select",
      options: paymentTermOptions,
    },
    {
      key: "memo",
      label: "Memo",
      type: "textarea",
      fullWidth: true,
    },
  ];

  return (
    <DocumentHeaderFields
      fields={fields}
      values={form as unknown as Record<string, string | boolean | null | undefined>}
      onChange={handleChange}
    />
  );
}
