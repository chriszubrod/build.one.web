import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { RoleModule } from "../../types/api";

export default function RoleModuleView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<RoleModule>(`/api/v1/get/role_module/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this role module assignment?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/role_module/${id}`);
      toast("Role module deleted.");
      navigate("/role-module/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title="Role Module"
      editPath={`/role-module/${id}/edit`}
      breadcrumbs={entityCrumbs("Role Modules", "/role-module/list", "Detail")}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Role ID", value: item.role_id },
        { label: "Module ID", value: item.module_id },
        { label: "Can Create", value: item.can_create ? "Yes" : "No" },
        { label: "Can Read", value: item.can_read ? "Yes" : "No" },
        { label: "Can Update", value: item.can_update ? "Yes" : "No" },
        { label: "Can Delete", value: item.can_delete ? "Yes" : "No" },
        { label: "Can Submit", value: item.can_submit ? "Yes" : "No" },
        { label: "Can Approve", value: item.can_approve ? "Yes" : "No" },
        { label: "Can Complete", value: item.can_complete ? "Yes" : "No" },
      ]}
    />
  );
}
