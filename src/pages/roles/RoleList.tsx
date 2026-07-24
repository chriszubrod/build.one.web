import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { hasRolePermission } from "./rolePermissions";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Role } from "../../types/api";

const columns: Column<Role>[] = [
  { key: "name", label: "Name" },
];

export default function RoleList() {
  const { items, loading, error } = useEntityList<Role>("/api/v1/get/roles");
  const { data: me } = useCurrentUser();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader
        title="Roles"
        count={items.length}
        // POST /api/v1/create/role — can_create
        createPath={hasRolePermission(me, "can_create") ? "/role/create" : undefined}
      />
      <DataTable columns={columns} data={items} basePath="/role" />
    </div>
  );
}
