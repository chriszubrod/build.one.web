import { useParams } from "react-router-dom";
import { useEntityItem } from "../../hooks/useEntity";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { ContractLabor } from "../../types/api";

function fmtMoney(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtPercent(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  return isNaN(n) ? String(v) : `${(n * 100).toFixed(1)}%`;
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

export default function ContractLaborView() {
  const { id } = useParams<{ id: string }>();
  const { item, loading, error } = useEntityItem<ContractLabor>(`/api/v1/contract-labor/${id}`);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  return (
    <DetailView
      title={`Contract Labor — ${item.employee_name}`}
      editPath={`/contract-labor/${id}/edit`}
      breadcrumbs={entityCrumbs("Contract Labor", "/contract-labor/list", item.employee_name)}
      fields={[
        { label: "Employee Name", value: item.employee_name },
        { label: "Vendor ID", value: item.vendor_id },
        { label: "Project ID", value: item.project_id },
        { label: "Work Date", value: item.work_date },
        { label: "Time In", value: item.time_in },
        { label: "Time Out", value: item.time_out },
        { label: "Break Time", value: item.break_time },
        { label: "Regular Hours", value: item.regular_hours },
        { label: "Overtime Hours", value: item.overtime_hours },
        { label: "Total Hours", value: item.total_hours },
        { label: "Hourly Rate", value: fmtMoney(item.hourly_rate) },
        { label: "Markup", value: fmtPercent(item.markup) },
        { label: "Total Amount", value: fmtMoney(item.total_amount) },
        { label: "Description", value: item.description },
        {
          label: "Status",
          value: (
            <span className={`status-badge ${statusClass(item.status)}`}>
              {fmtStatus(item.status)}
            </span>
          ),
        },
        { label: "Billing Period Start", value: item.billing_period_start },
        { label: "Import Batch ID", value: item.import_batch_id },
        { label: "Source File", value: item.source_file },
      ]}
    />
  );
}
