import { useAuth } from "../auth/AuthContext";


interface HeaderProps {
  scoutOpen?: boolean;
  onToggleScout?: () => void;
}


export default function Header({ scoutOpen, onToggleScout }: HeaderProps) {
  const { username, logout } = useAuth();

  return (
    <header className="header">
      <div className="header-spacer" />
      {onToggleScout && (
        <button
          type="button"
          className={`header-scout${scoutOpen ? " is-open" : ""}`}
          onClick={onToggleScout}
          aria-pressed={scoutOpen}
          aria-label={scoutOpen ? "Close Scout" : "Open Scout"}
        >
          Scout
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
