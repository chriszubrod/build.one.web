import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Address } from "../../types/api";

const columns: Column<Address>[] = [
  { key: "street_one", label: "Street" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
];

export default function AddressList() {
  const { items, loading, error } = useEntityList<Address>("/api/v1/get/addresses");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Addresses" count={items.length} createPath="/address/create" />
      <DataTable columns={columns} data={items} basePath="/address" />
    </div>
  );
}
