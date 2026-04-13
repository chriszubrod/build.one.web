import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { UserProject } from "../../types/api";

export default function UserProjectView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<UserProject>(`/api/v1/get/user_project/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this user project assignment?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/user_project/${id}`);
      toast("User project deleted.");
      navigate("/user-project/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title="User Project"
      editPath={`/user-project/${id}/edit`}
      breadcrumbs={entityCrumbs("User Projects", "/user-project/list", "Detail")}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "User ID", value: item.user_id },
        { label: "Project ID", value: item.project_id },
      ]}
    />
  );
}
