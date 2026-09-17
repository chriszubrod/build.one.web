import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEntityItem } from "../../hooks/useEntity";
import { getList, getOne } from "../../api/client";
import { useViewAttachmentObjectUrl } from "../../hooks/useViewAttachmentObjectUrl";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import LineItemTable, { type LineItemColumn } from "../../components/LineItemTable";
import ReviewTimeline from "../../components/ReviewTimeline";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import type { Expense, ExpenseLineItem, Project, SubCostCode, Vendor } from "../../types/api";
import {
  EXPENSE_STATUS_LABELS,
  expenseReviewBadgeClass,
  expenseReviewKind,
  expenseStatus,
  expenseStatusBadgeClass,
} from "./expenseLifecycle";

function fmtMoney(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

function makeLineItemCols(
  sccMap: Map<number, string>,
  projectMap: Map<number, string>,
): LineItemColumn<ExpenseLineItem>[] {
  return [
    { key: "description", label: "Description" },
    { key: "sub_cost_code_id", label: "Sub Cost Code", render: (v) => (v ? sccMap.get(v as number) ?? String(v) : "") },
    { key: "project_id", label: "Project", render: (v) => (v ? projectMap.get(v as number) ?? String(v) : "") },
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
}

export default function ExpenseView() {
  const { publicId } = useParams<{ publicId: string }>();
  const { item, loading, error } = useEntityItem<Expense>(`/api/v1/get/expense/${publicId}`);
  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);
  const sccMap = useIdNameMap<SubCostCode>("/api/v1/get/sub-cost-codes", (s) => s.number ? `${s.number} — ${s.name}` : s.name);
  const projectMap = useIdNameMap<Project>("/api/v1/get/projects", (p) => p.name);
  const [lineItems, setLineItems] = useState<ExpenseLineItem[]>([]);
  const [attachmentPublicId, setAttachmentPublicId] = useState<string | null>(null);
  const { objectUrl: attachmentBlobUrl, loading: attachmentLoading, loadError: attachmentLoadError } =
    useViewAttachmentObjectUrl(attachmentPublicId);

  useEffect(() => {
    if (!item) return;
    getList<ExpenseLineItem>(`/api/v1/get/expense_line_items/expense/${item.id}`)
      .then((res) => {
        setLineItems(res.data);
        setAttachmentPublicId(null);
        // Fetch receipt from first line item (one attachment shared across all)
        if (res.data.length > 0) {
          const firstLi = res.data[0];
          getOne<{ attachment_id: number }>(`/api/v1/get/expense-line-item-attachment/by-expense-line-item/${firstLi.public_id}`)
            .then((elia) => {
              if (elia.attachment_id) {
                getOne<{ public_id: string }>(`/api/v1/get/attachment/id/${elia.attachment_id}`)
                  .then((att) => setAttachmentPublicId(att.public_id))
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        setLineItems([]);
        setAttachmentPublicId(null);
      });
  }, [item]);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const status = expenseStatus(item);
  const statusLabel = EXPENSE_STATUS_LABELS[status] ?? status;
  const reviewKind = expenseReviewKind(item);

  return (
    <DetailView
      title={`Expense ${item.reference_number}`}
      editPath={`/expense/${publicId}/edit`}
      breadcrumbs={entityCrumbs("Expenses", "/expense/list", item.reference_number)}
      fields={[
        { label: "Reference Number", value: item.reference_number },
        { label: "Vendor", value: vendorMap.get(item.vendor_id) ?? item.vendor_id },
        { label: "Expense Date", value: fmtDate(item.expense_date) },
        { label: "Total Amount", value: fmtMoney(item.total_amount) },
        { label: "Memo", value: item.memo },
        {
          label: "Credit",
          value: item.is_credit ? "Yes" : "No",
        },
        {
          label: "Status",
          value: (
            <span className={`status-badge ${expenseStatusBadgeClass(status)}`}>
              {statusLabel}
            </span>
          ),
        },
        {
          label: "Review",
          value: item.review_status && item.review_status !== statusLabel ? (
            <span className={`status-badge ${expenseReviewBadgeClass(reviewKind)}`}>
              {item.review_status}
            </span>
          ) : (
            "—"
          ),
        },
      ]}
    >
      {publicId && <ReviewTimeline parentType="expense" parentPublicId={publicId} readOnly />}
      <LineItemTable columns={makeLineItemCols(sccMap, projectMap)} items={lineItems} />
      {attachmentPublicId && (
        <div className="pdf-viewer">
          <h3 className="line-items-heading">Attachment</h3>
          {attachmentLoading && <p className="text-muted">Loading attachment…</p>}
          {attachmentLoadError && <p className="page-error">Could not load attachment.</p>}
          {attachmentBlobUrl && (
            <iframe src={`${attachmentBlobUrl}#view=FitH&navpanes=0`} title="Expense receipt" />
          )}
        </div>
      )}
    </DetailView>
  );
}
