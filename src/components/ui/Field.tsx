interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "email" | "tel";
  autoFocus?: boolean;
  autoComplete?: string;
}

export default function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  autoComplete,
}: FieldProps) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input
        className="field-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
      />
    </div>
  );
}
