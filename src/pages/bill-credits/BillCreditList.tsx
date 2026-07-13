import { useEntityList } from "../../hooks/useEntity";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import DataTable, { type Column } from "../../components/DataTable";
import { moneyColumn } from "../../components/MoneyCell";
import PageHeader from "../../components/PageHeader";
import type { BillCredit, Vendor } from "../../types/api";

export default function BillCreditList() {
  const { items, loading, error } = useEntityList<BillCredit>("/api/v1/get/bill-credits");
  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);

  const columns: Column<BillCredit>[] = [
    { key: "credit_number", label: "Credit #" },
    { key: "vendor_id", label: "Vendor", render: (v) => vendorMap.get(v as number) ?? String(v) },
    { key: "credit_date", label: "Date" },
    moneyColumn<BillCredit>("total_amount"),
    {
      key: "is_draft",
      label: "Status",
      render: (v) => (
        <span className={`status-badge ${v ? "draft" : "finalized"}`}>
          {v ? "Draft" : "Finalized"}
        </span>
      ),
    },
  ];

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Bill Credits" count={items.length} createPath="/bill-credit/create" />
      <DataTable columns={columns} data={items} basePath="/bill-credit" />
    </div>
  );
}
