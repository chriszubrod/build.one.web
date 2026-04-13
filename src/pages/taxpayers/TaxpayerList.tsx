import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Taxpayer } from "../../types/api";

const columns: Column<Taxpayer>[] = [
  { key: "entity_name", label: "Entity Name" },
  { key: "business_name", label: "Business Name" },
  { key: "classification", label: "Classification" },
  { key: "is_signed", label: "Signed", render: (v) => (v ? "Yes" : "No") },
];

export default function TaxpayerList() {
  const { items, loading, error } = useEntityList<Taxpayer>("/api/v1/get/taxpayers");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Taxpayers" count={items.length} createPath="/taxpayer/create" />
      <DataTable columns={columns} data={items} basePath="/taxpayer" />
    </div>
  );
}
