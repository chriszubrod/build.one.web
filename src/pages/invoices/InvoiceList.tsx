import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import { moneyColumn } from "../../components/MoneyCell";
import PageHeader from "../../components/PageHeader";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import type { Invoice, Project } from "../../types/api";

export default function InvoiceList() {
  const { items, loading, error } = useEntityList<Invoice>("/api/v1/get/invoices");
  const projectMap = useIdNameMap<Project>("/api/v1/get/projects", (p) => p.name);

  const columns: Column<Invoice>[] = [
    { key: "invoice_number", label: "Invoice #" },
    { key: "project_id", label: "Project", render: (v) => projectMap.get(v as number) ?? String(v) },
    { key: "invoice_date", label: "Date" },
    { key: "due_date", label: "Due Date" },
    moneyColumn<Invoice>("total_amount"),
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
      <PageHeader title="Invoices" count={items.length} />
      <DataTable columns={columns} data={items} basePath="/invoice" />
    </div>
  );
}
