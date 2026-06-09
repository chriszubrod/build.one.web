export type Scope = "me" | "team";

interface ScopeToggleProps {
  value: Scope;
  onChange: (s: Scope) => void;
}

export default function ScopeToggle({ value, onChange }: ScopeToggleProps) {
  return (
    <div className="scope-toggle" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={value === "me"}
        className={`scope-toggle-btn${value === "me" ? " scope-toggle-btn-selected" : ""}`}
        onClick={() => onChange("me")}
      >
        Me
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "team"}
        className={`scope-toggle-btn${value === "team" ? " scope-toggle-btn-selected" : ""}`}
        onClick={() => onChange("team")}
      >
        Team
      </button>
    </div>
  );
}
