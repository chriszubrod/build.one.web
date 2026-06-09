interface SheetHeaderProps {
  title: string;
  onCancel: () => void;
  onSave?: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
}

export default function SheetHeader({
  title,
  onCancel,
  onSave,
  saveDisabled = false,
  saveLabel = "Save",
}: SheetHeaderProps) {
  return (
    <header className="sheet-header">
      <button type="button" className="sheet-header-btn" onClick={onCancel}>
        Cancel
      </button>
      <div className="sheet-header-title">{title}</div>
      {onSave ? (
        <button
          type="button"
          className="sheet-header-btn sheet-header-btn-save"
          onClick={onSave}
          disabled={saveDisabled}
        >
          {saveLabel}
        </button>
      ) : (
        <div />
      )}
    </header>
  );
}
