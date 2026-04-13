import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { RoleModule } from "../../types/api";

function formatPermissions(item: RoleModule): string {
  const perms: string[] = [];
  if (item.can_create) perms.push("Create");
  if (item.can_read) perms.push("Read");
  if (item.can_update) perms.push("Update");
  if (item.can_delete) perms.push("Delete");
  if (item.can_submit) perms.push("Submit");
  if (item.can_approve) perms.push("Approve");
  if (item.can_complete) perms.push("Complete");
  return perms.length > 0 ? perms.join(", ") : "None";
}

const columns: Column<RoleModule>[] = [
  { key: "role_id", label: "Role ID" },
  { key: "module_id", label: "Module ID" },
  { key: "can_create", label: "Permissions", render: (_value, item) => formatPermissions(item) },
];

export default function RoleModuleList() {
  const { items, loading, error } = useEntityList<RoleModule>("/api/v1/get/role_modules");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Role Modules" count={items.length} createPath="/role-module/create" />
      <DataTable columns={columns} data={items} basePath="/role-module" />
    </div>
  );
}
