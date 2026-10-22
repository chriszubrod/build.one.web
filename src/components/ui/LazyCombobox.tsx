import { useEffect, useState, type ComponentType } from "react";
import type { ComboboxOption } from "./comboboxFilter";
import type { ComboboxProps } from "./Combobox";

function labelForValue(options: ComboboxOption[], value: string): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? "";
}

function ComboboxFallback({
  value,
  options,
  placeholder = "Select...",
  required = false,
  name,
  id,
  variant = "form",
  label,
  ariaLabel,
  adornment,
}: ComboboxProps) {
  const fieldId = id ?? name;
  const selectedLabel = labelForValue(options, value);
  const inputClass =
    variant === "inline" ? "inline-li-input bo-combobox-input" : "bo-combobox-input";

  const comboControl = (
    <div
      className={`bo-combobox bo-combobox--${variant}`}
      data-bo-field={name ?? fieldId}
      data-bo-combobox-value={value}
      data-bo-combobox-pending=""
      aria-label={variant === "inline" ? ariaLabel : label}
    >
      <div className="bo-combobox-input-group">
        {name ? <input type="hidden" name={name} value={value} /> : null}
        <input
          id={variant === "form" ? fieldId : undefined}
          className={inputClass}
          value={selectedLabel}
          readOnly
          tabIndex={-1}
          placeholder={!value ? placeholder : undefined}
          aria-label={variant === "inline" ? ariaLabel : undefined}
          required={required}
        />
        {!required && value ? (
          <span className="bo-combobox-clear" aria-hidden style={{ visibility: "hidden" }}>
            ×
          </span>
        ) : null}
        <span className="bo-combobox-trigger" aria-hidden>
          ▾
        </span>
      </div>
    </div>
  );

  if (variant === "form") {
    return (
      <div className="form-group">
        {label ? (
          <label htmlFor={fieldId}>
            {label}
            {required ? <span className="required">*</span> : null}
          </label>
        ) : null}
        {comboControl}
        {adornment}
      </div>
    );
  }

  return comboControl;
}

let comboboxModulePromise: Promise<typeof import("./Combobox")> | null = null;
let comboboxDynamicImportCount = 0;

function loadComboboxModule(): Promise<typeof import("./Combobox")> {
  if (!comboboxModulePromise) {
    comboboxDynamicImportCount += 1;
    comboboxModulePromise = import("./Combobox").catch((err: unknown) => {
      // A failed chunk load (stale tab after a deploy, offline) must not be cached
      // forever: clear it so the next picker mount retries instead of leaving every
      // picker stuck on the read-only fallback.
      comboboxModulePromise = null;
      throw err;
    });
  }
  return comboboxModulePromise;
}

/** @internal LazyCombobox dedupe tests — not part of the public API. */
// eslint-disable-next-line react-refresh/only-export-components -- test-only import counter
export function __testComboboxDynamicImportCount(): number {
  return comboboxDynamicImportCount;
}

export default function LazyCombobox(props: ComboboxProps) {
  const [Combobox, setCombobox] = useState<ComponentType<ComboboxProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadComboboxModule().then(
      (mod) => {
        if (!cancelled) setCombobox(() => mod.default);
      },
      (err: unknown) => {
        console.error("Combobox failed to load; the picker stays read-only until reload", err);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Combobox) {
    return <ComboboxFallback {...props} />;
  }

  return <Combobox {...props} />;
}
