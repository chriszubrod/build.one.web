import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useEntityItem } from "../../hooks/useEntity";
import { getList, getOne } from "../../api/client";
import { useViewAttachmentObjectUrl } from "../../hooks/useViewAttachmentObjectUrl";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import LineItemTable, { type LineItemColumn } from "../../components/LineItemTable";
import ReviewTimeline, { type ReviewActionKind } from "../../components/ReviewTimeline";
import { useToast } from "../../components/Toast";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import type { Expense, ExpenseLineItem, Project, SubCostCode, Vendor } from "../../types/api";
import { expenseListPath } from "./expenseStatusTabs";
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

/**
 * After a draft is submitted from the View, open the next draft so a reviewer
 * can work a queue without returning to the list between items. The list is
 * asked for ONE draft (the one just submitted is no longer `draft`, so it
 * cannot come back); with none left we land on the Draft tab, which is where
 * the user was working.
 */
export async function nextDraftPath(): Promise<string> {
  try {
    const res = await getList<Expense>("/api/v1/get/expenses?status=draft&page=1&page_size=1");
    const next = res.data[0];
    if (next) return `/expense/${next.public_id}`;
  } catch {
    // Fall through — the Draft tab is the right place either way.
  }
  return expenseListPath("draft");
}

export default function ExpenseView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Expense>(`/api/v1/get/expense/${publicId}`);
  const vendorMap = useIdNameMap<Vendor>("/api/v1/get/vendors", (v) => v.name);
  const sccMap = useIdNameMap<SubCostCode>("/api/v1/get/sub-cost-codes", (s) => s.number ? `${s.number} — ${s.name}` : s.name);
  const projectMap = useIdNameMap<Project>("/api/v1/get/projects", (p) => p.name);
  const [lineItems, setLineItems] = useState<ExpenseLineItem[]>([]);
  const [attachmentPublicId, setAttachmentPublicId] = useState<string | null>(null);
  const { objectUrl: attachmentBlobUrl, loading: attachmentLoading, loadError: attachmentLoadError } =
    useViewAttachmentObjectUrl(attachmentPublicId);

  // Keyed on the expense's id, not the `item` object. A review action
  // invalidates the item query; the refetched object is a NEW identity for the
  // SAME expense, and keying on it re-ran this chain (line items → link →
  // attachment → receipt blob) and flashed the viewer. Lines and the receipt
  // only change on an edit, and an edit happens on a different page.
  const itemId = item?.id ?? null;
  useEffect(() => {
    if (itemId === null) return;
    let cancelled = false;
    setLineItems([]);
    setAttachmentPublicId(null);
    getList<ExpenseLineItem>(`/api/v1/get/expense_line_items/expense/${itemId}`)
      .then((res) => {
        if (cancelled) return;
        setLineItems(res.data);
        // Fetch receipt from first line item (one attachment shared across all)
        if (res.data.length > 0) {
          const firstLi = res.data[0];
          getOne<{ attachment_id: number }>(`/api/v1/get/expense-line-item-attachment/by-expense-line-item/${firstLi.public_id}`)
            .then((elia) => {
              if (cancelled || !elia.attachment_id) return;
              getOne<{ public_id: string }>(`/api/v1/get/attachment/id/${elia.attachment_id}`)
                .then((att) => { if (!cancelled) setAttachmentPublicId(att.public_id); })
                .catch(() => {});
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLineItems([]);
        setAttachmentPublicId(null);
      });
    return () => { cancelled = true; };
  }, [itemId]);

  // Set once a submit for THIS expense has landed, so the navigation below runs
  // exactly once even if the timeline re-renders. Reset when the route param
  // changes: the View route is keyed by publicId (ExpenseViewRoute) so a new
  // expense normally gets a fresh instance, but a direct render of this
  // component (tests, a future unkeyed route) must not work the queue only once.
  const advancingRef = useRef(false);
  useEffect(() => {
    advancingRef.current = false;
  }, [publicId]);
  const handleAfterReviewAction = async (action: ReviewActionKind) => {
    if (action !== "submit" || advancingRef.current) return;
    advancingRef.current = true;
    const target = await nextDraftPath();
    toast(target.startsWith("/expense/list") ? "Submitted — no more drafts." : "Submitted — opening the next draft.");
    navigate(target);
  };

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
      breadcrumbs={entityCrumbs("Expenses", expenseListPath(status), item.reference_number)}
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
      {/* Review actions live here too, not only on Edit (the Bill View keeps
          its timeline read-only). Nothing on this page is editable, so there is
          no pre-save; the POST goes straight out and the item query refreshes.
          `completed` is terminal server-side (422 status_locked), so the
          buttons are hidden there rather than offered and refused. The
          can_submit gate is ReviewTimeline's own — the same one
          POST /submit/review/expense enforces. */}
      {publicId && (
        <ReviewTimeline
          parentType="expense"
          parentPublicId={publicId}
          readOnly={status === "completed"}
          onAfterAction={handleAfterReviewAction}
        />
      )}
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
