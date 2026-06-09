import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

interface NavHeaderProps {
  title: ReactNode;
  onBack?: () => void;
  rightAction?: ReactNode;
}

export default function NavHeader({ title, onBack, rightAction }: NavHeaderProps) {
  return (
    <header className="nav-header">
      <div>
        {onBack && (
          <button type="button" className="nav-header-back" onClick={onBack} aria-label="Back">
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
        )}
      </div>
      <div className="nav-header-title">{title}</div>
      <div className="nav-header-action">{rightAction}</div>
    </header>
  );
}
