import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Project } from "../../types/api";

const columns: Column<Project>[] = [
  { key: "name", label: "Name" },
  { key: "abbreviation", label: "Abbreviation" },
  { key: "status", label: "Status" },
  { key: "description", label: "Description" },
];

export default function ProjectList() {
  const { items, loading, error } = useEntityList<Project>("/api/v1/get/projects");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Projects" count={items.length} createPath="/project/create" />
      <DataTable columns={columns} data={items} basePath="/project" />
    </div>
  );
}
