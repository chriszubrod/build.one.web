import { useEffect } from "react";
import type { ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onDismiss: () => void;
  children: ReactNode;
}

export default function Sheet({ open, onDismiss, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onDismiss}>
      <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
