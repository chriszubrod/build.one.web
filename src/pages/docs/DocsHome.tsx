import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import FreshnessBadge from "./FreshnessBadge";
import { DOCS_SECTIONS, FRESHNESS_WORD, type FreshnessClass } from "./docsSections";

const LEGEND: { kind: FreshnessClass; text: string }[] = [
  { kind: "live", text: "Read from the running deployment — cannot drift from what is deployed." },
  { kind: "derived", text: "Parsed from source at build time — as fresh as the last generate (age shown)." },
  { kind: "curated", text: "Hand-authored prose — kept current by the code-review protocol." },
];

/**
 * Docs landing — a menu of repositories (drill-down, mirroring ProfileView)
 * plus the freshness-badge legend. Reached from the admin-only sidebar entry.
 */
export default function DocsHome() {
  return (
    <div className="ios-page">
      <NavHeader title="Documentation" />

      <div className="section-label-prose">
        Internal reference for the Build One platform — how the five repositories
        are built and how they fit together.
      </div>

      <SectionCard header="Repositories">
        {DOCS_SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <ListRow
              key={s.id}
              icon={<Icon size={16} />}
              title={s.label}
              subtitle={s.role}
              value={s.status === "soon" ? "Soon" : FRESHNESS_WORD[s.badge]}
              to={`/docs/${s.id}`}
            />
          );
        })}
      </SectionCard>

      <SectionCard header="Reading the badges">
        <div className="docs-pad">
          <ul className="docs-legend">
            {LEGEND.map((l) => (
              <li key={l.kind} className="docs-legend-row">
                <FreshnessBadge kind={l.kind} />
                <span>{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </SectionCard>
    </div>
  );
}
