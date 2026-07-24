import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { hasPaymentTermPermission } from "./paymentTermPermissions";
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
  const { data: me } = useCurrentUser();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader
        title="Payment Terms"
        count={items.length}
        // POST /api/v1/create/payment-term — BILLS can_create
        createPath={hasPaymentTermPermission(me, "can_create") ? "/payment-term/create" : undefined}
      />
      <DataTable columns={columns} data={items} basePath="/payment-term" />
    </div>
  );
}
