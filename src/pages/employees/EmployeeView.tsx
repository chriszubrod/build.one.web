import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, removeEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { Employee } from "../../types/api";
import { hasEmployeePermission } from "./employeePermissions";

export default function EmployeeView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { item, loading, error } = useEntityItem<Employee>(
    `/api/v1/get/employee/${publicId}`,
  );
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Employee not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this employee?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/employee/${publicId}`);
      await removeEntity(queryClient, {
        listPath: "/api/v1/get/employees",
        itemPath: `/api/v1/get/employee/${publicId}`,
      });
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

  // PUT /api/v1/update/employee/:publicId — can_update
  const canUpdate = hasEmployeePermission(me, "can_update");
  // DELETE /api/v1/delete/employee/:publicId — can_delete
  const canDelete = hasEmployeePermission(me, "can_delete");

  return (
    <DetailView
      title={fullName}
      editPath={canUpdate ? `/employee/${publicId}/edit` : undefined}
      breadcrumbs={entityCrumbs("Employees", "/employee/list", fullName)}
      onDelete={canDelete ? handleDelete : undefined}
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
