interface TextareaFieldProps {
  label: string;
  name: string;
  value: string | null | undefined;
  onChange: (name: string, value: string) => void;
  required?: boolean;
  rows?: number;
  placeholder?: string;
  error?: string;
}

export default function TextareaField({
  label,
  name,
  value,
  onChange,
  required = false,
  rows = 3,
  placeholder,
  error,
}: TextareaFieldProps) {
  return (
    <div className={`form-group${error ? " has-error" : ""}`}>
      <label htmlFor={name}>
        {label}
        {required && <span className="required">*</span>}
      </label>
      <textarea
        id={name}
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(name, e.target.value)}
        rows={rows}
        placeholder={placeholder}
        required={required}
      />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
