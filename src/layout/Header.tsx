import { useAuth } from "../auth/AuthContext";

export default function Header() {
  const { username, logout } = useAuth();

  return (
    <header className="header">
      <div className="header-spacer" />
      <div className="header-user">
        <span>{username}</span>
        <button onClick={logout} className="header-logout">
          Sign Out
        </button>
      </div>
    </header>
  );
}
