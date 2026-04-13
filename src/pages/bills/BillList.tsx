import { useEntityList } from "../../hooks/useEntity";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Bill, Vendor } from "../../types/api";

function fmtMoney(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function BillList() {
  const { items, loading, error } = useEntityList<Bill>("/api/v1/get/bills");
  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);

  const columns: Column<Bill>[] = [
    { key: "bill_number", label: "Bill #" },
    { key: "vendor_id", label: "Vendor", render: (v) => vendorMap.get(v as number) ?? String(v) },
    { key: "bill_date", label: "Date" },
    { key: "due_date", label: "Due Date" },
    { key: "total_amount", label: "Amount", render: (v) => fmtMoney(v as string | null) },
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
      <PageHeader title="Bills" count={items.length} createPath="/bill/create" />
      <DataTable columns={columns} data={items} basePath="/bill" />
    </div>
  );
}
