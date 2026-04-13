import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { CostCode } from "../../types/api";

export default function CostCodeView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<CostCode>(`/api/v1/get/cost-code/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this cost code?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/cost-code/${id}`);
      toast("Cost code deleted.");
      navigate("/cost-code/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={`${item.number} — ${item.name}`}
      editPath={`/cost-code/${id}/edit`}
      breadcrumbs={entityCrumbs("Cost Codes", "/cost-code/list", item.number)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Number", value: item.number },
        { label: "Name", value: item.name },
        { label: "Description", value: item.description },
      ]}
    />
  );
}
