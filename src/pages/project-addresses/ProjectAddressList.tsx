import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { ProjectAddress } from "../../types/api";

const columns: Column<ProjectAddress>[] = [
  { key: "project_id", label: "Project ID" },
  { key: "address_id", label: "Address ID" },
  { key: "address_type_id", label: "Address Type ID" },
];

export default function ProjectAddressList() {
  const { items, loading, error } = useEntityList<ProjectAddress>("/api/v1/get/project_addresses");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Project Addresses" count={items.length} createPath="/project-address/create" />
      <DataTable columns={columns} data={items} basePath="/project-address" />
    </div>
  );
}
