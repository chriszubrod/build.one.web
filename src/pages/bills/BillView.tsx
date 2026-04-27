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
import type { Bill, BillLineItem, Vendor } from "../../types/api";
import type { SubCostCode, Project } from "../../types/api";

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

function fmtIntake(source: string | null, detail: string | null): string {
  if (!source) return "—";
  const labels: Record<string, string> = { manual: "Manual", agent: "Agent", script: "Script" };
  const label = labels[source] ?? source;
  return detail ? `${label}: ${detail}` : label;
}

function makeLineItemCols(
  sccMap: Map<number, string>,
  projectMap: Map<number, string>,
): LineItemColumn<BillLineItem>[] {
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

export default function BillView() {
  const { id } = useParams<{ id: string }>();
  const { item, loading, error } = useEntityItem<Bill>(`/api/v1/get/bill/${id}`);
  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);
  const sccMap = useIdNameMap<SubCostCode>("/api/v1/get/sub-cost-codes", (s) => s.number ? `${s.number} — ${s.name}` : s.name);
  const projectMap = useIdNameMap<Project>("/api/v1/get/projects", (p) => p.name);
  const [lineItems, setLineItems] = useState<BillLineItem[]>([]);
  const [attachmentPublicId, setAttachmentPublicId] = useState<string | null>(null);
  const { objectUrl: attachmentBlobUrl, loading: attachmentLoading, loadError: attachmentLoadError } =
    useViewAttachmentObjectUrl(attachmentPublicId);

  useEffect(() => {
    if (!item) return;
    getList<BillLineItem>(`/api/v1/get/bill_line_items/bill/${item.id}`)
      .then((res) => {
        setLineItems(res.data);
        setAttachmentPublicId(null);
        // Fetch attachment from first line item (one attachment shared across all)
        if (res.data.length > 0) {
          const firstLi = res.data[0];
          getOne<{ attachment_id: number }>(`/api/v1/get/bill-line-item-attachment/by-bill-line-item/${firstLi.public_id}`)
            .then((blia) => {
              if (blia.attachment_id) {
                getOne<{ public_id: string }>(`/api/v1/get/attachment/id/${blia.attachment_id}`)
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

  return (
    <DetailView
      title={`Bill ${item.bill_number}`}
      editPath={`/bill/${id}/edit`}
      breadcrumbs={entityCrumbs("Bills", "/bill/list", item.bill_number)}
      fields={[
        { label: "Bill Number", value: item.bill_number },
        { label: "Vendor", value: vendorMap.get(item.vendor_id) ?? item.vendor_id },
        { label: "Bill Date", value: fmtDate(item.bill_date) },
        { label: "Due Date", value: fmtDate(item.due_date) },
        { label: "Total Amount", value: fmtMoney(item.total_amount) },
        { label: "Memo", value: item.memo },
        { label: "Intake Source", value: fmtIntake(item.intake_source, item.intake_source_detail) },
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
      {id && <ReviewTimeline parentType="bill" parentPublicId={id} readOnly />}
      <LineItemTable columns={makeLineItemCols(sccMap, projectMap)} items={lineItems} />
      {attachmentPublicId && (
        <div className="pdf-viewer">
          <h3 className="line-items-heading">Attachment</h3>
          {attachmentLoading && <p className="text-muted">Loading attachment…</p>}
          {attachmentLoadError && <p className="page-error">Could not load attachment.</p>}
          {attachmentBlobUrl && (
            <iframe src={`${attachmentBlobUrl}#view=FitH&navpanes=0`} title="Bill PDF" />
          )}
        </div>
      )}
    </DetailView>
  );
}
