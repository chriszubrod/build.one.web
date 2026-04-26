import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEntityItem } from "../../hooks/useEntity";
import { getList } from "../../api/client";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import LineItemTable, { type LineItemColumn } from "../../components/LineItemTable";
import ReviewTimeline from "../../components/ReviewTimeline";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import type { Invoice, InvoiceLineItem, Project } from "../../types/api";

function fmtMoney(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const lineItemCols: LineItemColumn<InvoiceLineItem>[] = [
  { key: "source_type", label: "Source" },
  { key: "description", label: "Description" },
  { key: "sub_cost_code_id", label: "Sub Cost Code" },
  { key: "quantity", label: "Qty", align: "right" },
  { key: "rate", label: "Rate", align: "right", render: (v) => fmtMoney(v as string | null) },
  { key: "amount", label: "Amount", align: "right", render: (v) => fmtMoney(v as string | null) },
  { key: "markup", label: "Markup", align: "right", render: (v) => (v ? `${(Number(v) * 100).toFixed(1)}%` : "") },
  { key: "price", label: "Price", align: "right", render: (v) => fmtMoney(v as string | null) },
];

export default function InvoiceView() {
  const { id } = useParams<{ id: string }>();
  const { item, loading, error } = useEntityItem<Invoice>(`/api/v1/get/invoice/${id}`);
  const projectMap = useIdNameMap<Project>("/api/v1/get/projects", (p) => p.name);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);

  useEffect(() => {
    if (!item) return;
    getList<InvoiceLineItem>(`/api/v1/get/invoice_line_items/invoice/${item.id}`)
      .then((res) => setLineItems(res.data))
      .catch(() => setLineItems([]));
  }, [item]);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  return (
    <DetailView
      title={`Invoice ${item.invoice_number}`}
      editPath={`/invoice/${id}/edit`}
      breadcrumbs={entityCrumbs("Invoices", "/invoice/list", item.invoice_number)}
      fields={[
        { label: "Invoice Number", value: item.invoice_number },
        { label: "Project", value: projectMap.get(item.project_id) ?? item.project_id },
        { label: "Invoice Date", value: item.invoice_date },
        { label: "Due Date", value: item.due_date },
        { label: "Total Amount", value: fmtMoney(item.total_amount) },
        { label: "Memo", value: item.memo },
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
      {id && <ReviewTimeline parentType="invoice" parentPublicId={id} readOnly />}
      <LineItemTable columns={lineItemCols} items={lineItems} />
    </DetailView>
  );
}
