import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { UserProject } from "../../types/api";

const columns: Column<UserProject>[] = [
  { key: "user_id", label: "User ID" },
  { key: "project_id", label: "Project ID" },
];

export default function UserProjectList() {
  const { items, loading, error } = useEntityList<UserProject>("/api/v1/get/user_projects");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="User Projects" count={items.length} createPath="/user-project/create" />
      <DataTable columns={columns} data={items} basePath="/user-project" />
    </div>
  );
}
