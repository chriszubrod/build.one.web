import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import type { Invoice, Project } from "../../types/api";

function fmtMoney(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function InvoiceList() {
  const { items, loading, error } = useEntityList<Invoice>("/api/v1/get/invoices");
  const projectMap = useIdNameMap<Project>("/api/v1/get/projects", (p) => p.name);

  const columns: Column<Invoice>[] = [
    { key: "invoice_number", label: "Invoice #" },
    { key: "project_id", label: "Project", render: (v) => projectMap.get(v as number) ?? String(v) },
    { key: "invoice_date", label: "Date" },
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
      <PageHeader title="Invoices" count={items.length} createPath="/invoice/create" />
      <DataTable columns={columns} data={items} basePath="/invoice" />
    </div>
  );
}
