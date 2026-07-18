import NavHeader from "../../../components/ui/NavHeader";
import SectionCard from "../../../components/ui/SectionCard";
import ListRow from "../../../components/ui/ListRow";
import FreshnessBadge from "../FreshnessBadge";
import { webManifest } from "../webManifest";

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
 * The Web section — DERIVED facts only (introspected from routes.tsx +
 * menuConfig.ts at build time). No curated narrative.
 */
export default function WebDocs({ onBack }: { onBack: () => void }) {
  const { app, freshness, counts, routes } = webManifest;
  const stale = isStale(freshness.generated_at);
  const source =
    `${freshness.source_branch ?? "?"}` +
    (freshness.source_commit ? ` @ ${freshness.source_commit}` : "");

  return (
    <div className="ios-page">
      <NavHeader title="Web" onBack={onBack} />

      <div className="section-label-prose">
        <code>build.one.web</code> — this React admin + field app.{" "}
        <FreshnessBadge kind="derived" />
      </div>

      <SectionCard header="Snapshot" footer={freshness.note}>
        <ListRow title="Source" value={source} />
        <ListRow
          title="Generated"
          value={`${relativeAge(freshness.generated_at)}${stale ? " · stale" : ""}`}
        />
      </SectionCard>

      <SectionCard header="At a glance">
        <ListRow title="Framework" value={app.framework} />
        <ListRow title="Landing" value={app.landing} />
        <ListRow title="Routes" value={String(counts.routes)} />
        <ListRow title="In nav group" value={String(counts.nav_reachable)} />
        <ListRow title="Admin-only" value={String(counts.admin_only)} />
      </SectionCard>

      <SectionCard header={`Routes · ${counts.routes}`}>
        <div className="docs-pad">
          <details>
            <summary className="docs-summary">Show all {counts.routes} routes</summary>
            <div className="docs-table-wrap">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>Component</th>
                    <th>Auth</th>
                    <th>Nav group</th>
                    <th>Module</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => {
                    const muted = r.kind === "redirect";
                    const mutedClass = muted ? "docs-muted" : undefined;
                    const componentCell =
                      r.kind === "redirect" && r.redirect_to
                        ? `→ ${r.redirect_to}`
                        : r.component;
                    return (
                      <tr key={r.path}>
                        <td className={mutedClass}>
                          <code>{r.path}</code>
                          {r.requires_admin ? (
                            <span className="docs-chip" style={{ marginLeft: "0.35rem" }}>
                              admin
                            </span>
                          ) : null}
                        </td>
                        <td className={mutedClass}>{componentCell}</td>
                        <td className={mutedClass}>{r.auth}</td>
                        <td className={mutedClass}>
                          {r.nav_group ?? "—"}
                        </td>
                        <td className={mutedClass}>
                          {r.module ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </SectionCard>
    </div>
  );
}
