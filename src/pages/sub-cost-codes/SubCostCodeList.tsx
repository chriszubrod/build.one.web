import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { SubCostCode } from "../../types/api";

const columns: Column<SubCostCode>[] = [
  { key: "number", label: "Number" },
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
];

export default function SubCostCodeList() {
  const { items, loading, error } = useEntityList<SubCostCode>("/api/v1/get/sub-cost-codes");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Sub Cost Codes" count={items.length} createPath="/sub-cost-code/create" />
      <DataTable columns={columns} data={items} basePath="/sub-cost-code" />
    </div>
  );
}
