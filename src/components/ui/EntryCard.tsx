interface EntryCardProps {
  projectAbbrev: string;
  projectName: string;
  meta: string;
  duration: string;
  active?: boolean;
  workerName?: string;
  onClick?: () => void;
}

export default function EntryCard({
  projectAbbrev,
  projectName,
  meta,
  duration,
  active,
  workerName,
  onClick,
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
      <div className="entry-card-duration">{duration}</div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="entry-card" onClick={onClick}>
        {inner}
      </button>
    );
  }

  return <div className="entry-card">{inner}</div>;
}
