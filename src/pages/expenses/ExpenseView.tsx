import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEntityItem } from "../../hooks/useEntity";
import { getList } from "../../api/client";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import LineItemTable, { type LineItemColumn } from "../../components/LineItemTable";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import type { Expense, ExpenseLineItem, Vendor } from "../../types/api";

function fmtMoney(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const lineItemCols: LineItemColumn<ExpenseLineItem>[] = [
  { key: "description", label: "Description" },
  { key: "sub_cost_code_id", label: "Sub Cost Code" },
  { key: "project_id", label: "Project" },
  { key: "quantity", label: "Qty", align: "right" },
  { key: "rate", label: "Rate", align: "right", render: (v) => fmtMoney(v as string | null) },
  { key: "amount", label: "Amount", align: "right", render: (v) => fmtMoney(v as string | null) },
  { key: "markup", label: "Markup", align: "right", render: (v) => (v ? `${(Number(v) * 100).toFixed(1)}%` : "") },
  { key: "price", label: "Price", align: "right", render: (v) => fmtMoney(v as string | null) },
  {
    key: "is_billable",
    label: "Billable",
    render: (v) => (v === null ? "" : v ? "Yes" : "No"),
  },
];

export default function ExpenseView() {
  const { id } = useParams<{ id: string }>();
  const { item, loading, error } = useEntityItem<Expense>(`/api/v1/get/expense/${id}`);
  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);
  const [lineItems, setLineItems] = useState<ExpenseLineItem[]>([]);

  useEffect(() => {
    if (!item) return;
    getList<ExpenseLineItem>(`/api/v1/get/expense_line_items/expense/${item.id}`)
      .then((res) => setLineItems(res.data))
      .catch(() => setLineItems([]));
  }, [item]);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  return (
    <DetailView
      title={`Expense ${item.reference_number}`}
      editPath={`/expense/${id}/edit`}
      breadcrumbs={entityCrumbs("Expenses", "/expense/list", item.reference_number)}
      fields={[
        { label: "Reference Number", value: item.reference_number },
        { label: "Vendor", value: vendorMap.get(item.vendor_id) ?? item.vendor_id },
        { label: "Expense Date", value: item.expense_date },
        { label: "Total Amount", value: fmtMoney(item.total_amount) },
        { label: "Memo", value: item.memo },
        {
          label: "Credit",
          value: item.is_credit ? "Yes" : "No",
        },
        {
          label: "Status",
          value: (
            <span className={`status-badge ${item.is_draft ? "draft" : "finalized"}`}>
              {item.is_draft ? "Draft" : "Finalized"}
            </span>
          ),
        },
      ]}
    >
      <LineItemTable columns={lineItemCols} items={lineItems} />
    </DetailView>
  );
}
