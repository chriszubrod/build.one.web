import { useEntityList } from "../../hooks/useEntity";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import DataTable, { type Column } from "../../components/DataTable";
import { moneyColumn } from "../../components/MoneyCell";
import PageHeader from "../../components/PageHeader";
import type { Expense, Vendor } from "../../types/api";

export default function ExpenseList() {
  const { items, loading, error } = useEntityList<Expense>("/api/v1/get/expenses");
  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);

  const columns: Column<Expense>[] = [
    { key: "reference_number", label: "Reference #" },
    { key: "vendor_id", label: "Vendor", render: (v) => vendorMap.get(v as number) ?? String(v) },
    { key: "expense_date", label: "Date" },
    moneyColumn<Expense>("total_amount"),
    {
      key: "is_credit",
      label: "Credit",
      render: (v) => (v ? "Yes" : "No"),
    },
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
      <PageHeader title="Expenses" count={items.length} createPath="/expense/create" />
      <DataTable columns={columns} data={items} basePath="/expense" />
    </div>
  );
}
