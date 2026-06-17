import { Link } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import Sheet from "../components/ui/Sheet";
import SheetHeader from "../components/ui/SheetHeader";
import {
  entriesInSection,
  type MenuEntry,
  type NavSection,
} from "./menuConfig";

interface MoreDrawerProps {
  open: boolean;
  onDismiss: () => void;
}

interface SectionSpec {
  section: NavSection;
  label: string;
}

/**
 * Sections rendered in the More drawer, in display order. Primary slots
 * are NOT included — they live on the visible nav (BottomTabBar /
 * AppSidebar). Profile is in Account but typically shown as a primary
 * slot too; either path is fine since the same route resolves.
 */
const DRAWER_SECTIONS: SectionSpec[] = [
  { section: "financials", label: "Financials" },
  { section: "contacts", label: "Contacts" },
  { section: "admin", label: "Admin" },
  { section: "reference", label: "Reference" },
  { section: "account", label: "Account" },
];

/**
 * Bottom-sheet "More" drawer. Surface for everything that overflows the
 * 5-slot bottom pill cap, grouped by NavSection. RBAC gating applies via
 * `entriesInSection` — sections with zero visible entries are omitted
 * entirely.
 *
 * Nav Phase 0 — Built as the foundation; not yet wired into BottomTabBar
 * because today's 3 primary slots fit without overflow. Phase 1 brings
 * Vendors / Customers / Projects online and a "More" slot lands on the
 * bottom pill that opens this drawer.
 */
export default function MoreDrawer({ open, onDismiss }: MoreDrawerProps) {
  const { data: me } = useCurrentUser();

  const sectionsWithEntries: { spec: SectionSpec; entries: MenuEntry[] }[] = [];
  for (const spec of DRAWER_SECTIONS) {
    const entries = entriesInSection(spec.section, me);
    if (entries.length > 0) sectionsWithEntries.push({ spec, entries });
  }

  return (
    <Sheet open={open} onDismiss={onDismiss}>
      <SheetHeader title="More" onCancel={onDismiss} />
      <div className="sheet-body more-drawer-body">
        {sectionsWithEntries.length === 0 ? (
          <div className="more-drawer-empty">
            More surfaces will appear here as they come online.
          </div>
        ) : (
          sectionsWithEntries.map(({ spec, entries }) => (
            <section key={spec.section} className="more-drawer-section">
              <h3 className="more-drawer-section-label">{spec.label}</h3>
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
