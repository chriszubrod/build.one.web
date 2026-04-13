import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { UserRole } from "../../types/api";

export default function UserRoleView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<UserRole>(`/api/v1/get/user_role/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this user role assignment?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/user_role/${id}`);
      toast("User role deleted.");
      navigate("/user-role/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title="User Role"
      editPath={`/user-role/${id}/edit`}
      breadcrumbs={entityCrumbs("User Roles", "/user-role/list", "Detail")}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "User ID", value: item.user_id },
        { label: "Role ID", value: item.role_id },
      ]}
    />
  );
}
