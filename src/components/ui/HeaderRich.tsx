import { Building2 } from "lucide-react";
import AvatarPhoto from "./AvatarPhoto";

interface ClockedInPillState {
  project: string;
  elapsed: string;
}

interface HeaderRichProps {
  initials: string;
  name: string;
  role?: string;
  company?: string;
  clockedIn?: ClockedInPillState;
}

export default function HeaderRich({
  initials,
  name,
  role,
  company,
  clockedIn,
}: HeaderRichProps) {
  return (
    <div className="header-rich">
      <AvatarPhoto initials={initials} size={72} showStatusDot={!!clockedIn} />
      <div className="header-rich-text">
        <div className="header-rich-name">{name}</div>
        {role && <div className="header-rich-role">{role}</div>}
        {company && (
          <div className="header-rich-company">
            <Building2 size={14} strokeWidth={2} />
            <span>{company}</span>
          </div>
        )}
        {clockedIn && (
          <div className="header-rich-pill">
            <span className="header-rich-pill-dot" />
            <span>
              {clockedIn.project} · {clockedIn.elapsed}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
