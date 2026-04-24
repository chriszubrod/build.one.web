import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Integration } from "../../types/api";

const columns: Column<Integration>[] = [
  { key: "name", label: "Name" },
  {
    key: "status",
    label: "Status",
    render: (v) => {
      const s = String(v);
      const color = s === "connected" ? "#16a34a" : s === "error" ? "#dc2626" : "#64748b";
      return <span style={{ color, fontWeight: 500, textTransform: "capitalize" }}>{s}</span>;
    },
  },
];

export default function IntegrationList() {
  const { items, loading, error } = useEntityList<Integration>("/api/v1/get/integrations");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Integrations" count={items.length} createPath="/integration/create" />
      <DataTable columns={columns} data={items} basePath="/integration" />
    </div>
  );
}
