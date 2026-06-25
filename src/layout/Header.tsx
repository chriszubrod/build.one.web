import { useAuth } from "../auth/AuthContext";


interface HeaderProps {
  buildoneOpen?: boolean;
  onToggleBuildOne?: () => void;
}


export default function Header({ buildoneOpen, onToggleBuildOne }: HeaderProps) {
  const { username, logout } = useAuth();

  return (
    <header className="header">
      <div className="header-spacer" />
      {onToggleBuildOne && (
        <button
          type="button"
          className={`header-buildone${buildoneOpen ? " is-open" : ""}`}
          onClick={onToggleBuildOne}
          aria-pressed={buildoneOpen}
          aria-label={buildoneOpen ? "Close Build.One" : "Open Build.One"}
        >
          Build.One
        </button>
      )}
      <div className="header-user">
        <span>{username}</span>
        <button onClick={logout} className="header-logout">
          Sign Out
        </button>
      </div>
    </header>
  );
}
