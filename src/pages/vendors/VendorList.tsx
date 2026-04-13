import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Vendor } from "../../types/api";

const columns: Column<Vendor>[] = [
  { key: "name", label: "Name" },
  { key: "abbreviation", label: "Abbreviation" },
  {
    key: "is_contract_labor",
    label: "Contract Labor",
    render: (v) => (v ? "Yes" : "No"),
  },
  {
    key: "is_draft",
    label: "Status",
    render: (v) => (v ? "Draft" : "Active"),
  },
];

export default function VendorList() {
  const { items, loading, error } = useEntityList<Vendor>("/api/v1/get/vendors");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Vendors" count={items.length} createPath="/vendor/create" />
      <DataTable columns={columns} data={items} basePath="/vendor" />
    </div>
  );
}
