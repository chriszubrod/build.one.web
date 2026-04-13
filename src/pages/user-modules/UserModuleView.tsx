import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { UserModule } from "../../types/api";

export default function UserModuleView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<UserModule>(`/api/v1/get/user_module/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this user module assignment?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/user_module/${id}`);
      toast("User module deleted.");
      navigate("/user-module/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title="User Module"
      editPath={`/user-module/${id}/edit`}
      breadcrumbs={entityCrumbs("User Modules", "/user-module/list", "Detail")}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "User ID", value: item.user_id },
        { label: "Module ID", value: item.module_id },
      ]}
    />
  );
}
