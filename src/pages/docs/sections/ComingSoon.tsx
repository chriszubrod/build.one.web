import NavHeader from "../../../components/ui/NavHeader";
import SectionCard from "../../../components/ui/SectionCard";
import ListRow from "../../../components/ui/ListRow";
import { FRESHNESS_WORD, type DocsSection } from "../docsSections";

/**
 * Placeholder for repo sections not yet built (API/Web/MCP/Scheduler in v1).
 * Shows the repo + its planned freshness class so the full-application IA is
 * legible even before the per-repo panel lands.
 */
export default function ComingSoon({
  section,
  onBack,
}: {
  section: DocsSection;
  onBack: () => void;
}) {
  return (
    <div className="ios-page">
      <NavHeader title={section.label} onBack={onBack} />

      <div className="section-label-prose">{section.role}</div>

      <SectionCard
        header="Status"
        footer="This section is planned but not yet built. It will carry the planned freshness class shown above once its per-repo panel lands."
      >
        <ListRow title="Repository" value={section.repo} />
        <ListRow title="Planned freshness" value={FRESHNESS_WORD[section.badge]} />
        <ListRow title="Status" value="Coming soon" />
      </SectionCard>
    </div>
  );
}
