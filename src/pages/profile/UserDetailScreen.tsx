import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getOne, getList } from "../../api/client";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import AvatarPhoto from "../../components/ui/AvatarPhoto";
import NavHeader from "../../components/ui/NavHeader";
import SectionCard from "../../components/ui/SectionCard";
import ListRow from "../../components/ui/ListRow";
import type { User, Contact } from "../../types/api";

function initialsFromName(first?: string | null, last?: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (l) return l.slice(0, 2).toUpperCase();
  return "?";
}

export default function UserDetailScreen() {
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const userPublicId = me?.user?.public_id;

  const userQuery = useQuery<User>({
    queryKey: ["user", userPublicId],
    queryFn: () => getOne<User>(`/api/v1/get/user/${userPublicId}`),
    enabled: !!userPublicId,
  });

  const contactsQuery = useQuery<Contact[]>({
    queryKey: ["user-contacts", userPublicId],
    queryFn: async () =>
      (await getList<Contact>(`/api/v1/get/contacts/user/${userPublicId}`)).data,
    enabled: !!userPublicId,
  });

  if (!me || !userQuery.data) {
    return (
      <div className="ios-page">
        <NavHeader title="Details" onBack={() => navigate("/profile")} />
        <div className="page-loading">Loading…</div>
      </div>
    );
  }

  const user = userQuery.data;
  const contact = contactsQuery.data?.[0];
  const initials = initialsFromName(user.firstname, user.lastname);
  const moduleCount = me.modules?.length ?? 0;
  const projectCount = me.accessible_project_ids?.length ?? 0;

  return (
    <div className="ios-page">
      <NavHeader title="Details" onBack={() => navigate("/profile")} />
      <div className="hero-avatar">
        <AvatarPhoto initials={initials} size={120} />
      </div>

      <SectionCard header="User">
        <ListRow title="First name" value={user.firstname ?? ""} to="/profile/details/firstname" />
        <ListRow title="Last name" value={user.lastname ?? ""} to="/profile/details/lastname" />
        <ListRow title="Username" value={me.auth.username} />
      </SectionCard>

      <SectionCard header="Contact">
        <ListRow title="Mobile" value={contact?.mobile_phone ?? "—"} />
        <ListRow title="Email" value={contact?.email ?? "—"} />
      </SectionCard>

      <SectionCard header="Work">
        <ListRow
          title="Organization"
          value={me.active_company?.organization?.name ?? "—"}
        />
        <ListRow title="Company" value={me.active_company?.name ?? "—"} />
        <ListRow title="Role & assignments" value={me.role?.name ?? "—"} />
        <ListRow title="Modules" value={`${moduleCount} module${moduleCount === 1 ? "" : "s"}`} />
        <ListRow title="Projects" value={`${projectCount} project${projectCount === 1 ? "" : "s"}`} />
      </SectionCard>
    </div>
  );
}
