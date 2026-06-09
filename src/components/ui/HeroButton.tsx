import type { ReactNode } from "react";

interface HeroButtonProps {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  variant?: "primary" | "destructive";
  disabled?: boolean;
}

export default function HeroButton({
  label,
  icon,
  onClick,
  variant = "primary",
  disabled,
}: HeroButtonProps) {
  return (
    <button
      type="button"
      className={`hero-button${variant === "destructive" ? " hero-button-destructive" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
