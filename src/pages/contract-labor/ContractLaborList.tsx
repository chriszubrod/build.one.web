import { useEntityList } from "../../hooks/useEntity";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { ContractLabor, Vendor } from "../../types/api";

function fmtMoney(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtStatus(v: string): string {
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(v: string): string {
  const map: Record<string, string> = {
    pending_review: "pending-review",
    ready: "ready",
    billed: "billed",
  };
  return map[v] ?? v.replace(/_/g, "-");
}

export default function ContractLaborList() {
  const { items, loading, error } = useEntityList<ContractLabor>("/api/v1/contract-labor");
  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);

  const columns: Column<ContractLabor>[] = [
    { key: "employee_name", label: "Employee" },
    { key: "vendor_id", label: "Vendor", render: (v) => vendorMap.get(v as number) ?? String(v) },
    { key: "work_date", label: "Date" },
    { key: "total_hours", label: "Hours" },
    { key: "hourly_rate", label: "Rate", render: (v) => fmtMoney(v as string | null) },
    { key: "total_amount", label: "Amount", render: (v) => fmtMoney(v as string | null) },
    {
      key: "status",
      label: "Status",
      render: (v) => (
        <span className={`status-badge ${statusClass(v as string)}`}>
          {fmtStatus(v as string)}
        </span>
      ),
    },
  ];

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Contract Labor" count={items.length} createPath="/contract-labor/create" />
      <DataTable columns={columns} data={items} basePath="/contract-labor" />
    </div>
  );
}
