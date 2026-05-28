import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { Employee } from "../../types/api";

export default function EmployeeView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Employee>(`/api/v1/get/employee/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Employee not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this employee?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/employee/${id}`);
      toast("Employee deleted.");
      navigate("/employee/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  const fullName = `${item.firstname} ${item.lastname}`.trim();
  const markupDisplay = item.markup ? `${(Number(item.markup) * 100).toFixed(0)}%` : "—";
  const rateDisplay = item.hourly_rate ? `$${item.hourly_rate}` : "—";

  return (
    <DetailView
      title={fullName}
      editPath={`/employee/${id}/edit`}
      breadcrumbs={entityCrumbs("Employees", "/employee/list", fullName)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "First Name", value: item.firstname },
        { label: "Last Name", value: item.lastname },
        { label: "Email", value: item.email || "—" },
        { label: "Hourly Rate", value: rateDisplay },
        { label: "Markup", value: markupDisplay },
        { label: "Status", value: item.is_active ? "Active" : "Inactive" },
        { label: "Notes", value: item.notes || "—" },
      ]}
    />
  );
}
