interface DateFieldProps {
  label: string;
  name: string;
  value: string | null | undefined;
  onChange: (name: string, value: string) => void;
  required?: boolean;
  error?: string;
}

export default function DateField({
  label,
  name,
  value,
  onChange,
  required = false,
  error,
}: DateFieldProps) {
  // Convert ISO datetime strings to YYYY-MM-DD for the date input
  const dateValue = value ? value.substring(0, 10) : "";

  return (
    <div className={`form-group${error ? " has-error" : ""}`}>
      <label htmlFor={name}>
        {label}
        {required && <span className="required">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type="date"
        value={dateValue}
        onChange={(e) => onChange(name, e.target.value)}
        required={required}
      />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
