import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { User } from "../../types/api";

export default function UserView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<User>(`/api/v1/get/user/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this user?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/user/${id}`);
      toast("User deleted.");
      navigate("/user/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={`${item.firstname} ${item.lastname ?? ""}`.trim()}
      editPath={`/user/${id}/edit`}
      breadcrumbs={entityCrumbs("Users", "/user/list", item.firstname)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "First Name", value: item.firstname },
        { label: "Last Name", value: item.lastname },
      ]}
    />
  );
}
