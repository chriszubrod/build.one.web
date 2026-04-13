import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { AddressType } from "../../types/api";

const columns: Column<AddressType>[] = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
  { key: "display_order", label: "Display Order" },
];

export default function AddressTypeList() {
  const { items, loading, error } = useEntityList<AddressType>("/api/v1/get/address_types");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Address Types" count={items.length} createPath="/address-type/create" />
      <DataTable columns={columns} data={items} basePath="/address-type" />
    </div>
  );
}
