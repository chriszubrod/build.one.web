import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { VendorType } from "../../types/api";

const columns: Column<VendorType>[] = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
];

export default function VendorTypeList() {
  const { items, loading, error } = useEntityList<VendorType>("/api/v1/get/vendor-types");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Vendor Types" count={items.length} createPath="/vendor-type/create" />
      <DataTable columns={columns} data={items} basePath="/vendor-type" />
    </div>
  );
}
