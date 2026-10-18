interface Option {
  value: string;
  label: string;
}

import type { ReactNode } from "react";

interface SelectFieldProps {
  label: string;
  name: string;
  value: string | null | undefined;
  onChange: (name: string, value: string) => void;
  options: Option[];
  required?: boolean;
  error?: string;
  placeholder?: string;
  adornment?: ReactNode;
}

export default function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  required = false,
  error,
  placeholder = "Select...",
  adornment,
}: SelectFieldProps) {
  return (
    <div className={`form-group${error ? " has-error" : ""}`}>
      <label htmlFor={name}>
        {label}
        {required && <span className="required">*</span>}
      </label>
      <select
        id={name}
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        required={required}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {adornment}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
