import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  name: string;
  value: string | number | null | undefined;
  onChange: (name: string, value: string) => void;
  type?: "text" | "number" | "email" | "tel";
  required?: boolean;
  error?: string;
  placeholder?: string;
  /** Optional row below the input (e.g. file-read acceptance badge). */
  adornment?: ReactNode;
}

export default function FormField({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  error,
  placeholder,
  adornment,
}: FormFieldProps) {
  return (
    <div className={`form-group${error ? " has-error" : ""}`}>
      <label htmlFor={name}>
        {label}
        {required && <span className="required">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        required={required}
      />
      {adornment}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
