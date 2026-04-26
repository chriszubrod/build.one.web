import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEntityItem } from "../../hooks/useEntity";
import { getList } from "../../api/client";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import LineItemTable, { type LineItemColumn } from "../../components/LineItemTable";
import ReviewTimeline from "../../components/ReviewTimeline";
import type { BillCredit, BillCreditLineItem } from "../../types/api";

function fmtMoney(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const lineItemCols: LineItemColumn<BillCreditLineItem>[] = [
  { key: "description", label: "Description" },
  { key: "sub_cost_code_id", label: "Sub Cost Code" },
  { key: "project_id", label: "Project" },
  { key: "quantity", label: "Qty", align: "right" },
  { key: "unit_price", label: "Unit Price", align: "right", render: (v) => fmtMoney(v as string | null) },
  { key: "amount", label: "Amount", align: "right", render: (v) => fmtMoney(v as string | null) },
  {
    key: "is_billable",
    label: "Billable",
    render: (v) => (v === null ? "" : v ? "Yes" : "No"),
  },
  { key: "billable_amount", label: "Billable Amount", align: "right", render: (v) => fmtMoney(v as string | null) },
];

export default function BillCreditView() {
  const { id } = useParams<{ id: string }>();
  const { item, loading, error } = useEntityItem<BillCredit>(`/api/v1/get/bill-credit/${id}`);
  const [lineItems, setLineItems] = useState<BillCreditLineItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getList<BillCreditLineItem>(`/api/v1/get/bill-credit-line-items/by-bill-credit/${id}`)
      .then((res) => setLineItems(res.data))
      .catch(() => setLineItems([]));
  }, [id]);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  return (
    <DetailView
      title={`Bill Credit ${item.credit_number}`}
      editPath={`/bill-credit/${id}/edit`}
      breadcrumbs={entityCrumbs("Bill Credits", "/bill-credit/list", item.credit_number)}
      fields={[
        { label: "Credit Number", value: item.credit_number },
        { label: "Vendor ID", value: item.vendor_id },
        { label: "Credit Date", value: item.credit_date },
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
      {id && <ReviewTimeline parentType="bill_credit" parentPublicId={id} readOnly />}
      <LineItemTable columns={lineItemCols} items={lineItems} />
    </DetailView>
  );
}
