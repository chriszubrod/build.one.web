interface EntryCardProps {
  projectAbbrev: string;
  projectName: string;
  meta: string;
  duration: string;
  active?: boolean;
  onClick?: () => void;
}

export default function EntryCard({
  projectAbbrev,
  projectName,
  meta,
  duration,
  active,
  onClick,
}: EntryCardProps) {
  const inner = (
    <>
      <div className="entry-card-tile">{projectAbbrev}</div>
      <div className="entry-card-body">
        <div className="entry-card-title">
          {active && <span className="entry-card-active-dot" />}
          {projectName}
        </div>
        <div className="entry-card-meta">{meta}</div>
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
