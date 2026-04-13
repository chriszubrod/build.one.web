import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { UserModule } from "../../types/api";

const columns: Column<UserModule>[] = [
  { key: "user_id", label: "User ID" },
  { key: "module_id", label: "Module ID" },
];

export default function UserModuleList() {
  const { items, loading, error } = useEntityList<UserModule>("/api/v1/get/user_modules");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="User Modules" count={items.length} createPath="/user-module/create" />
      <DataTable columns={columns} data={items} basePath="/user-module" />
    </div>
  );
}
