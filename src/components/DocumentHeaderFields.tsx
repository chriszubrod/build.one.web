import { Fragment, type ReactNode } from "react";
import FormField from "./FormField";
import DateField from "./DateField";
import TextareaField from "./TextareaField";
import SelectField from "./SelectField";
import LazyCombobox from "./ui/LazyCombobox";

export type DocumentHeaderFieldType =
  | "text"
  | "date"
  | "number"
  | "select"
  | "combobox"
  | "textarea"
  | "checkbox";

export interface DocumentHeaderFieldDef {
  key: string;
  label: string;
  type: DocumentHeaderFieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  fullWidth?: boolean;
  adornment?: ReactNode;
}

export interface DocumentHeaderFieldsProps {
  fields: DocumentHeaderFieldDef[];
  values: Record<string, string | boolean | null | undefined>;
  onChange: (key: string, value: string | boolean) => void;
}

/**
 * Config-driven document header block — Bill-style label-left rows inside
 * `.detail-fields-form` (Vendor → Number → Date → …).
 */
export default function DocumentHeaderFields({
  fields,
  values,
  onChange,
}: DocumentHeaderFieldsProps) {
  const stringOnChange = onChange as (name: string, value: string) => void;

  return (
    <div className="detail-fields-form">
      {fields.map((field) => {
        const raw = values[field.key];
        const stringValue =
          typeof raw === "string" ? raw : raw == null ? "" : String(raw);
        let control: ReactNode;

        switch (field.type) {
          case "select":
            control = (
              <SelectField
                label={field.label}
                name={field.key}
                value={stringValue}
                onChange={stringOnChange}
                options={field.options ?? []}
                required={field.required}
                adornment={field.adornment}
              />
            );
            break;
          case "combobox":
            control = (
              <LazyCombobox
                variant="form"
                label={field.label}
                name={field.key}
                id={field.key}
                value={stringValue}
                onChange={(v) => stringOnChange(field.key, v)}
                options={field.options ?? []}
                required={field.required}
                adornment={field.adornment}
              />
            );
            break;
          case "date":
            control = (
              <DateField
                label={field.label}
                name={field.key}
                value={stringValue}
                onChange={stringOnChange}
                required={field.required}
                adornment={field.adornment}
              />
            );
            break;
          case "textarea":
            control = (
              <TextareaField
                label={field.label}
                name={field.key}
                value={stringValue}
                onChange={stringOnChange}
                required={field.required}
              />
            );
            break;
          case "checkbox":
            control = (
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(raw)}
                    onChange={(e) => onChange(field.key, e.target.checked)}
                  />{" "}
                  {field.label}
                </label>
              </div>
            );
            break;
          case "number":
          default:
            control = (
              <FormField
                label={field.label}
                name={field.key}
                type={field.type === "number" ? "number" : "text"}
                value={stringValue}
                onChange={stringOnChange}
                required={field.required}
                adornment={field.adornment}
              />
            );
            break;
        }

        if (field.fullWidth) {
          return (
            <div key={field.key} className="full-width">
              {control}
            </div>
          );
        }
        return <Fragment key={field.key}>{control}</Fragment>;
      })}
    </div>
  );
}
