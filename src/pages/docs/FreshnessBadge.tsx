import type { FreshnessClass } from "./docsSections";

const LABELS: Record<FreshnessClass, string> = {
  live: "LIVE",
  derived: "DERIVED",
  curated: "CURATED",
  mixed: "DERIVED + CURATED",
};

/**
 * Freshness classification chip. Tells an admin how current a section's content
 * is by construction:
 * - LIVE — read from the running deployment at view time (cannot drift).
 * - DERIVED — parsed from source at build time (as fresh as the last generate).
 * - CURATED — hand-authored prose (kept fresh by the review protocol).
 */
export default function FreshnessBadge({
  kind,
  title,
}: {
  kind: FreshnessClass;
  title?: string;
}) {
  return (
    <span className={`docs-badge docs-badge-${kind}`} title={title}>
      {LABELS[kind]}
    </span>
  );
}
