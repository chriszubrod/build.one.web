import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ComboBox,
  Input,
  Button,
  Popover,
  ListBox,
  ListBoxItem,
  Group,
} from "react-aria-components";
import {
  filterRankComboboxOptions,
  type ComboboxOption,
} from "./comboboxFilter";

export type { ComboboxOption };

const TRUNCATED_HINT_ID = "__bo_combobox_truncated__";
const MAX_COMBOBOX_RESULTS = 50;

type ComboboxPropsBase = {
  /** Must be referentially stable and never mutated (memoized per array). */
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  name?: string;
  id?: string;
  variant?: "form" | "inline";
  adornment?: ReactNode;
};

export type ComboboxProps = ComboboxPropsBase &
  ({ label: string; ariaLabel?: never } | { ariaLabel: string; label?: never });

function labelForValue(options: ComboboxOption[], value: string): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? "";
}

export default function Combobox({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  placeholder = "Select...",
  required = false,
  name,
  id,
  variant = "form",
  adornment,
}: ComboboxProps) {
  const fieldId = id ?? name;

  const selectedLabel = useMemo(() => labelForValue(options, value), [options, value]);

  /** null = mirror selected label; string = user draft while focused. */
  const [draft, setDraft] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const focusActiveRef = useRef(false);
  const [valueWhenFocused, setValueWhenFocused] = useState(value);

  const externalValueWhileFocused =
    isFocused && draft === null && value !== valueWhenFocused;
  const displayInputValue =
    isFocused && !externalValueWhileFocused && draft !== null
      ? draft
      : selectedLabel;

  const filterQuery =
    menuOpen && displayInputValue === selectedLabel ? "" : displayInputValue;

  const { items, truncatedCount } = useMemo(
    () => filterRankComboboxOptions(options, filterQuery, MAX_COMBOBOX_RESULTS),
    [options, filterQuery],
  );

  const listItems = useMemo(() => {
    const out: ComboboxOption[] = [...items];
    if (truncatedCount > 0) {
      out.push({
        value: TRUNCATED_HINT_ID,
        label: `Keep typing to narrow ${truncatedCount} more`,
        disabled: true,
      });
    }
    return out;
  }, [items, truncatedCount]);

  const emitChange = useCallback(
    (next: string) => {
      if (next !== value) onChange(next);
    },
    [onChange, value],
  );

  const handleSelectionChange = useCallback(
    (key: string | number | null) => {
      if (key === TRUNCATED_HINT_ID) return;
      if (key == null) {
        setDraft(null);
        return;
      }
      const next = String(key);
      const opt = options.find((o) => o.value === next);
      if (opt?.disabled) return;
      emitChange(next);
      setDraft(null);
    },
    [emitChange, options],
  );

  const handleClear = useCallback(() => {
    if (required) return;
    emitChange("");
    setDraft(null);
  }, [emitChange, required]);

  const handleInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
    }
    if (e.key === "Escape") {
      setDraft(null);
    }
  };

  const commitInputOnBlur = useCallback(() => {
    focusActiveRef.current = false;
    setIsFocused(false);
    setDraft(null);
  }, []);

  const handleInputFocus = useCallback(() => {
    // react-aria re-dispatches a synthetic focus on the input while typing (virtual focus
    // leaving an option); only a real focus transition may reset the draft.
    if (focusActiveRef.current) return;
    focusActiveRef.current = true;
    setValueWhenFocused(value);
    setIsFocused(true);
    setDraft(null);
  }, [value]);

  const inputClass =
    variant === "inline" ? "inline-li-input bo-combobox-input" : "bo-combobox-input";

  const comboControl = (
    <ComboBox
      id={variant === "inline" ? fieldId : undefined}
      name={name}
      data-bo-field={name ?? fieldId}
      aria-label={variant === "inline" ? ariaLabel : label}
      selectedKey={value || null}
      onSelectionChange={handleSelectionChange}
      inputValue={displayInputValue}
      onInputChange={(v) => {
        setDraft(v);
      }}
      items={listItems}
      defaultFilter={() => true}
      allowsEmptyCollection
      isRequired={required}
      menuTrigger="focus"
      onOpenChange={setMenuOpen}
      className={`bo-combobox bo-combobox--${variant}`}
      data-bo-combobox-value={value}
      formValue="key"
    >
      <Group className="bo-combobox-input-group">
        <Input
          id={variant === "form" ? fieldId : undefined}
          className={inputClass}
          placeholder={!value ? placeholder : undefined}
          onKeyDown={handleInputKeyDown}
          onFocus={handleInputFocus}
          onBlur={commitInputOnBlur}
          aria-label={variant === "inline" ? ariaLabel : undefined}
          required={required}
        />
        {!required && value ? (
          <button
            type="button"
            className="bo-combobox-clear"
            aria-label="Clear"
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleClear();
            }}
          >
            ×
          </button>
        ) : null}
        <Button className="bo-combobox-trigger" aria-label="Show options">
          ▾
        </Button>
      </Group>
      <Popover className="bo-combobox-popover">
        <ListBox<ComboboxOption> className="bo-combobox-listbox">
          {(item) => (
            <ListBoxItem
              id={item.value}
              textValue={item.value === TRUNCATED_HINT_ID ? "" : item.label}
              isDisabled={item.disabled || item.value === TRUNCATED_HINT_ID}
              className="bo-combobox-option"
            >
              {item.value === TRUNCATED_HINT_ID ? (
                <span className="bo-combobox-truncated-hint">{item.label}</span>
              ) : (
                item.label
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
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
