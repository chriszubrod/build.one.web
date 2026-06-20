import NavHeader from "../../../components/ui/NavHeader";
import SectionCard from "../../../components/ui/SectionCard";
import ListRow from "../../../components/ui/ListRow";
import FreshnessBadge from "../FreshnessBadge";
import DocsMarkdown from "../DocsMarkdown";
import { iosManifest, iosNarrative } from "../iosManifest";

/** "today" / "1 day ago" / "N days ago" from an ISO timestamp. */
function relativeAge(iso: string | null): string {
  if (!iso) return "unknown";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

const STALE_AFTER_DAYS = 30;

function isStale(iso: string | null): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then > STALE_AFTER_DAYS * 86_400_000;
}

/**
 * The iOS section — the v1 focus. DERIVED facts (parsed from build.one.ios
 * source by gen_docs_manifest.py) + CURATED narrative, on the native
 * SectionCard/ListRow primitives. The iOS app cannot be live-introspected from
 * the web, so the snapshot age is shown prominently.
 */
export default function IOSDocs({ onBack }: { onBack: () => void }) {
  const { app, architecture, freshness, features, services, endpoints, core_data_entities, privacy, counts } =
    iosManifest;
  const stale = isStale(freshness.generated_at);
  const source =
    `${freshness.source_branch ?? "?"}` +
    (freshness.source_commit ? ` @ ${freshness.source_commit}` : "");

  return (
    <div className="ios-page">
      <NavHeader title="iOS app" onBack={onBack} />

      <div className="section-label-prose">
        <code>build.one.ios</code> — the offline-first field-worker app.{" "}
        <FreshnessBadge kind="mixed" />
      </div>

      <SectionCard header="Snapshot" footer={freshness.note}>
        <ListRow title="Source" value={source} />
        <ListRow
          title="Generated"
          value={`${relativeAge(freshness.generated_at)}${stale ? " · stale" : ""}`}
        />
      </SectionCard>

      <SectionCard header="At a glance">
        <ListRow title="Version" value={`${app.marketing_version ?? "—"} (build ${app.build ?? "—"})`} />
        <ListRow title="Minimum iOS" value={app.min_ios ?? "—"} />
        <ListRow title="Bundle ID" value={app.bundle_id} />
        <ListRow title="Third-party deps" value={String(architecture.third_party_dependencies)} />
      </SectionCard>

      <SectionCard header="Architecture">
        <ListRow title="Pattern" subtitle={architecture.pattern} />
        <ListRow title="Networking" subtitle={architecture.networking} />
        <ListRow title="Persistence" subtitle={architecture.persistence} />
      </SectionCard>

      <SectionCard header={`Features · ${counts.features}`}>
        <div className="docs-pad">
          <div className="docs-chips">
            {features.map((f) => <span key={f} className="docs-chip">{f}</span>)}
          </div>
        </div>
      </SectionCard>

      <SectionCard header={`Services · ${counts.services}`}>
        <div className="docs-pad">
          <div className="docs-chips">
            {services.map((s) => <span key={s} className="docs-chip">{s}</span>)}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        header={`CoreData entities · ${counts.core_data_entities}`}
        footer={`${counts.user_scoped_entities} of ${counts.core_data_entities} are user-scoped (carry a userId for shared-device isolation).`}
      >
        <div className="docs-pad">
          <div className="docs-chips">
            {core_data_entities.map((e) => (
              <span key={e.name} className={`docs-chip${e.user_scoped ? " docs-chip-scoped" : ""}`}>
                {e.name}
              </span>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard header={`API endpoints · ${counts.endpoints}`}>
        <div className="docs-pad">
          <details>
            <summary className="docs-summary">Show all {counts.endpoints} endpoints</summary>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr><th>Method</th><th>Path</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {endpoints.map((e) => (
                    <tr key={`${e.file}:${e.name}`}>
                      <td><span className={`docs-method docs-method-${e.method}`}>{e.method}</span></td>
                      <td><code>{e.path ?? e.name}</code></td>
                      <td className="docs-muted">{e.file}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </SectionCard>

      <SectionCard header="Privacy manifest" footer="Parsed from PrivacyInfo.xcprivacy.">
        <ListRow title="Tracking" value={privacy.tracking ? "Yes" : "No"} />
        <div className="docs-pad">
          <div className="docs-sublabel">Collected data types</div>
          <div className="docs-chips">
            {(privacy.collected_data_types ?? []).map((d) => <span key={d} className="docs-chip">{d}</span>)}
          </div>
          <div className="docs-sublabel">Required-reason APIs</div>
          <div className="docs-chips">
            {(privacy.required_reason_apis ?? []).map((a) => <span key={a} className="docs-chip">{a}</span>)}
          </div>
        </div>
      </SectionCard>

      <SectionCard header="How it works">
        <div className="docs-pad">
          {iosNarrative.map((doc) => (
            <DocsMarkdown key={doc.id}>{doc.body}</DocsMarkdown>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
