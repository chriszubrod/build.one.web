import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { UserRole } from "../../types/api";

const columns: Column<UserRole>[] = [
  { key: "user_id", label: "User ID" },
  { key: "role_id", label: "Role ID" },
];

export default function UserRoleList() {
  const { items, loading, error } = useEntityList<UserRole>("/api/v1/get/user_roles");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="User Roles" count={items.length} createPath="/user-role/create" />
      <DataTable columns={columns} data={items} basePath="/user-role" />
    </div>
  );
}
