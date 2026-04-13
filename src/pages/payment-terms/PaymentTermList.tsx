import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { PaymentTerm } from "../../types/api";

const columns: Column<PaymentTerm>[] = [
  { key: "name", label: "Name" },
  { key: "due_days", label: "Due Days" },
  { key: "discount_percent", label: "Discount %" },
  { key: "discount_days", label: "Discount Days" },
];

export default function PaymentTermList() {
  const { items, loading, error } = useEntityList<PaymentTerm>("/api/v1/get/payment-terms");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Payment Terms" count={items.length} createPath="/payment-term/create" />
      <DataTable columns={columns} data={items} basePath="/payment-term" />
    </div>
  );
}
