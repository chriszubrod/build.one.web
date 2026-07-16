import { Link } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import Sheet from "../components/ui/Sheet";
import SheetHeader from "../components/ui/SheetHeader";
import { secondarySectionsForUser } from "./menuConfig";

interface MoreDrawerProps {
  open: boolean;
  onDismiss: () => void;
}

/**
 * Bottom-sheet "More" drawer. Surface for everything that overflows the
 * 5-slot bottom pill cap, grouped by NavSection. RBAC gating and the
 * no-double-listing invariant live in `secondarySectionsForUser` — sections
 * with zero visible entries are omitted entirely.
 *
 * Wired into BottomTabBar — the More tab opens this sheet when
 * `secondarySectionsForUser` returns at least one section.
 */
export default function MoreDrawer({ open, onDismiss }: MoreDrawerProps) {
  const { data: me } = useCurrentUser();
  const sections = secondarySectionsForUser(me);

  return (
    <Sheet open={open} onDismiss={onDismiss}>
      <SheetHeader title="More" onCancel={onDismiss} />
      <div className="sheet-body more-drawer-body">
        {sections.length === 0 ? (
          <div className="more-drawer-empty">
            More surfaces will appear here as they come online.
          </div>
        ) : (
          sections.map(({ section, label, entries }) => (
            <section key={section} className="more-drawer-section">
              <h3 className="more-drawer-section-label">{label}</h3>
              <ul className="more-drawer-list">
                {entries.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <li key={entry.id}>
                      <Link
                        to={entry.route}
                        className="more-drawer-link"
                        onClick={onDismiss}
                      >
                        <Icon size={18} strokeWidth={2} />
                        <span>{entry.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </Sheet>
  );
}
