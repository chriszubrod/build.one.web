import { Bell, Building2, Briefcase, LogOut, Mail, Palette, Shield, ShieldOff, User } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import HeaderRich from "../../components/ui/HeaderRich";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";

function initialsFromName(first?: string | null, last?: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (l) return l.slice(0, 2).toUpperCase();
  return "?";
}

export default function ProfileView() {
  const { data: me, isLoading } = useCurrentUser();
  const { logout } = useAuth();

  if (isLoading || !me) {
    return <div className="ios-page"><div className="page-loading">Loading…</div></div>;
  }

  const firstname = me.user?.firstname ?? "";
  const lastname = me.user?.lastname ?? "";
  const fullName = [firstname, lastname].filter(Boolean).join(" ") || me.auth.username;
  const initials = initialsFromName(firstname, lastname);
  const roleName = me.role?.name ?? null;

  const personalDetailsValue = firstname || fullName;

  const handleLogout = () => {
    if (confirm("Log out of this device?")) logout();
  };

  const handleSignOutAll = () => {
    if (confirm("Sign out of all devices? This will end every active session.")) {
      // TODO: wire to API endpoint once confirmed (was Phase 5 follow-up)
      logout();
    }
  };

  return (
    <div className="ios-page">
      <HeaderRich
        initials={initials}
        name={fullName}
        role={roleName ?? undefined}
        company={undefined}
      />

      <SectionCard header="Account">
        <ListRow
          icon={<User size={16} />}
          title="Personal details"
          value={personalDetailsValue}
          to="/profile/details"
        />
        <ListRow
          icon={<Mail size={16} />}
          title="Contact"
          value="—"
          to="/profile/details"
        />
        <ListRow
          icon={<Briefcase size={16} />}
          title="Role & assignments"
          value={roleName ?? "—"}
          to="/profile/details"
        />
        <ListRow
          icon={<Building2 size={16} />}
          title="Company"
          value="—"
          to="/profile/details"
        />
      </SectionCard>

      <SectionCard header="App">
        <ListRow
          icon={<Shield size={16} />}
          title="Security"
          to="/profile/security"
        />
        <ListRow
          icon={<Palette size={16} />}
          title="Theme"
          value="Light"
          to="/profile/appearance"
        />
        <ListRow
          icon={<Bell size={16} />}
          title="Push notifications"
          subtitle="Browsers ask separately"
          value="Off"
          trailing="value"
        />
        <ListRow
          icon={<ShieldOff size={16} />}
          title="Sign out of all devices"
          onClick={handleSignOutAll}
        />
        <ListRow
          icon={<LogOut size={16} />}
          title="Log out"
          destructive
          onClick={handleLogout}
        />
      </SectionCard>
    </div>
  );
}
