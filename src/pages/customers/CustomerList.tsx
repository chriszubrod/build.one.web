import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Customer } from "../../types/api";

const columns: Column<Customer>[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

export default function CustomerList() {
  const { items, loading, error } = useEntityList<Customer>("/api/v1/get/customers");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Customers" count={items.length} createPath="/customer/create" />
      <DataTable columns={columns} data={items} basePath="/customer" />
    </div>
  );
}
