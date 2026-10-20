import type { ReactNode } from "react";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
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

  const handleChange = (name: string, value: string) => {
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

  return (
    <div className="detail-fields-form">
      <SelectField
        label="Vendor"
        name="vendor_public_id"
        value={form.vendor_public_id}
        onChange={handleChange}
        options={vendorOptions}
        required={mode === "create"}
        adornment={
          mode === "create"
            ? createHeaderAdornment?.("vendor_public_id")
            : editAdornment("vendor_public_id")
        }
      />
      <FormField
        label="Bill Number"
        name="bill_number"
        value={form.bill_number}
        onChange={handleChange}
        required={required}
        adornment={
          mode === "create"
            ? createHeaderAdornment?.("bill_number")
            : editAdornment("bill_number")
        }
      />
      <DateField
        label="Bill Date"
        name="bill_date"
        value={form.bill_date}
        onChange={handleChange}
        required={required}
        adornment={
          mode === "create"
            ? createHeaderAdornment?.("bill_date")
            : editAdornment("bill_date")
        }
      />
      <SelectField
        label="Payment Term"
        name="payment_term_public_id"
        value={form.payment_term_public_id}
        onChange={handleChange}
        options={paymentTermOptions}
      />
      <div className="full-width">
        <TextareaField label="Memo" name="memo" value={form.memo} onChange={handleChange} />
      </div>
    </div>
  );
}
