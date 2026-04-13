import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Role } from "../../types/api";

const columns: Column<Role>[] = [
  { key: "name", label: "Name" },
];

export default function RoleList() {
  const { items, loading, error } = useEntityList<Role>("/api/v1/get/roles");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Roles" count={items.length} createPath="/role/create" />
      <DataTable columns={columns} data={items} basePath="/role" />
    </div>
  );
}
