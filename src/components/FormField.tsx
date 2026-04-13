interface FormFieldProps {
  label: string;
  name: string;
  value: string | number | null | undefined;
  onChange: (name: string, value: string) => void;
  type?: "text" | "number" | "email" | "tel";
  required?: boolean;
  error?: string;
  placeholder?: string;
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
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
