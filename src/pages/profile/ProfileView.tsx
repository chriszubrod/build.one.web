import { Bell, Building2, Briefcase, LogOut, Mail, Palette, Shield, ShieldOff, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { getList } from "../../api/client";
import HeaderRich from "../../components/ui/HeaderRich";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import type { Contact } from "../../types/api";

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
  const { logout, signOutAllDevices } = useAuth();
  // The contacts endpoint expects an integer User.Id, not the public_id
  // UUID. The /auth/me payload exposes both — use the int here.
  const userId = me?.user?.id;

  // Pull contacts for the Contact summary row. Tier 2's NetworkFirst
  // caches the response, so subsequent visits paint instantly from disk.
  const contactsQuery = useQuery<Contact[]>({
    queryKey: ["user-contacts", userId],
    queryFn: async () =>
      (await getList<Contact>(`/api/v1/get/contacts/user/${userId}`)).data,
    enabled: !!userId,
  });

  if (isLoading || !me) {
    return <div className="ios-page"><div className="page-loading">Loading…</div></div>;
  }

  const firstname = me.user?.firstname ?? "";
  const lastname = me.user?.lastname ?? "";
  const fullName = [firstname, lastname].filter(Boolean).join(" ") || me.auth.username;
  const initials = initialsFromName(firstname, lastname);
  // System admins (User.IsSystemAdmin=1) bypass role-based RBAC, so the
  // server intentionally returns role: null on /auth/me. Surface a
  // meaningful "System Admin" label here so the row isn't empty.
  const roleName = me.is_admin
    ? "System Admin"
    : me.role?.name ?? null;
  const companyName = me.active_company?.name ?? null;
  const primaryContact = contactsQuery.data?.[0];
  const contactValue =
    primaryContact?.email ??
    primaryContact?.mobile_phone ??
    primaryContact?.office_phone ??
    null;

  const personalDetailsValue = firstname || fullName;

  const handleLogout = () => {
    if (confirm("Log out of this device?")) logout();
  };

  const handleSignOutAll = () => {
    if (
      confirm(
        "Sign out of all devices? This will end every active session, including this one.",
      )
    ) {
      // Fire-and-await — the API call revokes every active refresh-token
      // row for this user, then signOutAllDevices runs the local logout
      // (cleanup + redirect). Best-effort on the server call; local
      // logout proceeds even on network failure.
      void signOutAllDevices();
    }
  };

  return (
    <div className="ios-page">
      <HeaderRich
        initials={initials}
        name={fullName}
        role={roleName ?? undefined}
        company={companyName ?? undefined}
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
          value={contactValue ?? "—"}
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
          value={companyName ?? "—"}
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
          title="Appearance"
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
