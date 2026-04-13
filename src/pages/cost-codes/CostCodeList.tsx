import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { CostCode } from "../../types/api";

const columns: Column<CostCode>[] = [
  { key: "number", label: "Number" },
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
];

export default function CostCodeList() {
  const { items, loading, error } = useEntityList<CostCode>("/api/v1/get/cost-codes");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Cost Codes" count={items.length} createPath="/cost-code/create" />
      <DataTable columns={columns} data={items} basePath="/cost-code" />
    </div>
  );
}
