import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { SubCostCode } from "../../types/api";

export default function SubCostCodeView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<SubCostCode>(`/api/v1/get/sub-cost-code/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this sub cost code?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/sub-cost-code/${id}`);
      toast("Sub cost code deleted.");
      navigate("/sub-cost-code/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={`${item.number} — ${item.name}`}
      editPath={`/sub-cost-code/${id}/edit`}
      breadcrumbs={entityCrumbs("Sub Cost Codes", "/sub-cost-code/list", item.number)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Number", value: item.number },
        { label: "Name", value: item.name },
        { label: "Description", value: item.description },
        { label: "Cost Code ID", value: item.cost_code_id },
      ]}
    />
  );
}
