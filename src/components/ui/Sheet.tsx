import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

export const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const SheetTitleIdContext = createContext<string | undefined>(undefined);

export function useSheetTitleId() {
  return useContext(SheetTitleIdContext);
}

interface SheetProps {
  open: boolean;
  onDismiss: () => void;
  id?: string;
  children: ReactNode;
}

export default function Sheet({ open, onDismiss, id, children }: SheetProps) {
  const autoId = useId();
  const sheetId = id ?? autoId;
  const titleId = sheetId + "-title";
  const cardRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // Capture the trigger during render on the closed->open transition: React
  // applies a child's autoFocus at commit, BEFORE passive effects, so an
  // effect-time capture would grab the autoFocused input instead of the
  // opener. cardRef.current is null until commit and is nulled again on
  // unmount, so this re-captures per real open and a discarded render
  // cannot poison it. Do not move this into an effect.
  if (open && cardRef.current === null) {
    triggerRef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (card && !card.contains(document.activeElement)) card.focus();

    return () => {
      // React nulls cardRef before passive cleanup (including StrictMode replay), so
      // use the setup-captured node: a still-connected card means dev-only effect
      // replay, not a real dismissal — restoring focus would defeat autoFocus and
      // discard the captured trigger.
      if (card !== null && card.isConnected) return;
      const trigger = triggerRef.current;
      triggerRef.current = null;
      const active = document.activeElement;
      const focusWasOurs =
        active === null ||
        active === document.body ||
        (card !== null && card.contains(active));
      if (!focusWasOurs) return;
      if (trigger && trigger.isConnected) trigger.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- models the open lifecycle; must not re-run on callback identity (consumers pass inline handlers whose identity changes every render)
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  if (!open) return null;

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const card = cardRef.current;
    if (!card) return;
    const nodes = card.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (nodes.length === 0) {
      e.preventDefault();
      card.focus();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || active === card) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onDismiss}>
      <div
        className="sheet-card"
        id={sheetId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <SheetTitleIdContext.Provider value={titleId}>
          {children}
        </SheetTitleIdContext.Provider>
      </div>
    </div>
  );
}
