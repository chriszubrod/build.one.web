import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { VendorAddress } from "../../types/api";

const columns: Column<VendorAddress>[] = [
  { key: "vendor_id", label: "Vendor ID" },
  { key: "address_id", label: "Address ID" },
  { key: "address_type_id", label: "Address Type ID" },
];

export default function VendorAddressList() {
  const { items, loading, error } = useEntityList<VendorAddress>("/api/v1/get/vendor_addresses");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Vendor Addresses" count={items.length} createPath="/vendor-address/create" />
      <DataTable columns={columns} data={items} basePath="/vendor-address" />
    </div>
  );
}
