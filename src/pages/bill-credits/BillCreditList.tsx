import { useEntityList } from "../../hooks/useEntity";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { BillCredit, Vendor } from "../../types/api";

function fmtMoney(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function BillCreditList() {
  const { items, loading, error } = useEntityList<BillCredit>("/api/v1/get/bill-credits");
  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);

  const columns: Column<BillCredit>[] = [
    { key: "credit_number", label: "Credit #" },
    { key: "vendor_id", label: "Vendor", render: (v) => vendorMap.get(v as number) ?? String(v) },
    { key: "credit_date", label: "Date" },
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
      <PageHeader title="Bill Credits" count={items.length} createPath="/bill-credit/create" />
      <DataTable columns={columns} data={items} basePath="/bill-credit" />
    </div>
  );
}
