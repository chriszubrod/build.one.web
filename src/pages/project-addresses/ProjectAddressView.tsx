import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { ProjectAddress } from "../../types/api";

export default function ProjectAddressView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<ProjectAddress>(`/api/v1/get/project_address/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this project address?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/project_address/${id}`);
      toast("Project address deleted.");
      navigate("/project-address/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title="Project Address"
      editPath={`/project-address/${id}/edit`}
      breadcrumbs={entityCrumbs("Project Addresses", "/project-address/list", "Detail")}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Project ID", value: item.project_id },
        { label: "Address ID", value: item.address_id },
        { label: "Address Type ID", value: item.address_type_id },
      ]}
    />
  );
}
