import { Check, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  value?: string;
  trailing?: "chevron" | "value" | "toggle" | "checkmark" | "none";
  toggleValue?: boolean;
  onToggleChange?: (v: boolean) => void;
  selected?: boolean;
  destructive?: boolean;
  to?: string;
  onClick?: () => void;
}

export default function ListRow({
  title,
  subtitle,
  icon,
  value,
  trailing,
  toggleValue,
  onToggleChange,
  selected,
  destructive,
  to,
  onClick,
}: ListRowProps) {
  const inferredTrailing =
    trailing ??
    (selected
      ? "checkmark"
      : toggleValue !== undefined
      ? "toggle"
      : to
      ? "chevron"
      : value !== undefined
      ? "value"
      : "none");

  const content = (
    <>
      {icon && <div className="list-row-icon">{icon}</div>}
      <div className="list-row-content">
        <div className="list-row-title">{title}</div>
        {subtitle && <div className="list-row-subtitle">{subtitle}</div>}
      </div>
      <div className="list-row-trailing">
        {(inferredTrailing === "value" || inferredTrailing === "chevron") && value && (
          <span className="list-row-value">{value}</span>
        )}
        {inferredTrailing === "chevron" && (
          <ChevronRight size={18} strokeWidth={2} className="list-row-chevron" />
        )}
        {inferredTrailing === "checkmark" && (
          <Check size={20} strokeWidth={2.5} />
        )}
        {inferredTrailing === "toggle" && (
          <label className="ios-toggle" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={toggleValue}
              onChange={(e) => onToggleChange?.(e.target.checked)}
            />
            <span className="ios-toggle-track" />
          </label>
        )}
      </div>
    </>
  );

  const className = `list-row${to || onClick ? " list-row-link" : ""}${
    destructive ? " list-row-destructive" : ""
  }`;

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
