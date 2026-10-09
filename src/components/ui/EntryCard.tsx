import type { ReactNode } from "react";

interface EntryCardProps {
  projectAbbrev: string;
  projectName: string;
  meta: string;
  duration: string;
  active?: boolean;
  workerName?: string;
  /**
   * Optional trailing badge, under the `duration` line (U-452). Bills carry a
   * lifecycle badge that has nowhere to live in the Labor shape; Labor passes
   * nothing and renders exactly as before.
   */
  badge?: ReactNode;
  onClick?: () => void;
  /**
   * Fired on hover / keyboard focus / touch-start, before any click. Lists
   * use it to prefetch the row's detail query so the View mounts warm. Must be
   * idempotent — it fires on every re-entry.
   */
  onPrefetch?: () => void;
}

export default function EntryCard({
  projectAbbrev,
  projectName,
  meta,
  duration,
  active,
  workerName,
  badge,
  onClick,
  onPrefetch,
}: EntryCardProps) {
  const metaLine = workerName ? `${workerName} · ${meta}` : meta;
  const inner = (
    <>
      <div className="entry-card-tile">{projectAbbrev}</div>
      <div className="entry-card-body">
        <div className="entry-card-title">
          {active && <span className="entry-card-active-dot" />}
          {projectName}
        </div>
        <div className="entry-card-meta">{metaLine}</div>
      </div>
      <div className="entry-card-trailing">
        <div className="entry-card-duration">{duration}</div>
        {badge && <div className="entry-card-badge">{badge}</div>}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="entry-card"
        onClick={onClick}
        onMouseEnter={onPrefetch}
        onFocus={onPrefetch}
        onTouchStart={onPrefetch}
      >
        {inner}
      </button>
    );
  }

  return <div className="entry-card">{inner}</div>;
}
