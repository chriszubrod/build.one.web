import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Module } from "../../types/api";

const columns: Column<Module>[] = [
  { key: "name", label: "Name" },
  { key: "route", label: "Route" },
];

export default function ModuleList() {
  const { items, loading, error } = useEntityList<Module>("/api/v1/get/modules");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Modules" count={items.length} createPath="/module/create" />
      <DataTable columns={columns} data={items} basePath="/module" />
    </div>
  );
}
