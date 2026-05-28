import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useLookups } from "../../hooks/useLookups";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { EmployeeLabor } from "../../types/api";

const STATUS_LABEL: Record<string, string> = {
  pending_review: "Pending Review",
  ready: "Ready",
  invoiced: "Invoiced",
};

export default function EmployeeLaborView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<EmployeeLabor>(`/api/v1/get/employee-labor/${id}`);
  const { data: lookups } = useLookups("employees,projects,sub_cost_codes");
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">EmployeeLabor not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this employee labor row? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/employee-labor/${id}`);
      toast("EmployeeLabor deleted.");
      navigate("/employee-labor/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  const employee = (lookups.employees ?? []).find((e) => e.id === item.employee_id);
  const project = (lookups.projects ?? []).find((p: any) => p.id === item.project_id);
  const scc = (lookups.sub_cost_codes ?? []).find((s) => s.id === item.sub_cost_code_id);

  const totalAmount = item.total_amount ? `$${Number(item.total_amount).toFixed(2)}` : "—";
  const rate = item.hourly_rate ? `$${item.hourly_rate}` : "—";
  const markupPct = item.markup ? `${(Number(item.markup) * 100).toFixed(0)}%` : "—";
  const isLocked = item.status === "invoiced";

  return (
    <DetailView
      title={`${employee?.label ?? "Employee"} — ${item.work_date}`}
      editPath={isLocked ? undefined : `/employee-labor/${id}/edit`}
      breadcrumbs={entityCrumbs("Employee Labor", "/employee-labor/list", `${employee?.label ?? "Row"} — ${item.work_date}`)}
      onDelete={isLocked ? undefined : handleDelete}
      deleting={deleting}
      fields={[
        { label: "Employee", value: employee?.label ?? `#${item.employee_id}` },
        { label: "Project", value: project?.name ?? (item.project_id ? `#${item.project_id}` : "—") },
        { label: "Work Date", value: item.work_date ?? "—" },
        { label: "Billing Period", value: `${item.billing_period_start} — ${item.billing_period_end}` },
        { label: "Total Hours", value: item.total_hours ?? "—" },
        { label: "Hourly Rate", value: rate },
        { label: "Markup", value: markupPct },
        { label: "Total Amount", value: totalAmount },
        { label: "Sub Cost Code", value: scc ? `${scc.number} — ${scc.name}` : "—" },
        { label: "Status", value: STATUS_LABEL[item.status ?? ""] ?? item.status ?? "—" },
        { label: "Description", value: item.description ?? "—" },
        { label: "Source Time Entry", value: item.source_time_entry_id ? `TimeEntry #${item.source_time_entry_id}` : <span className="text-muted">manual</span> },
        { label: "Invoice Line", value: item.invoice_line_item_id ? `InvoiceLineItem #${item.invoice_line_item_id}` : <span className="text-muted">not invoiced</span> },
      ]}
    />
  );
}
