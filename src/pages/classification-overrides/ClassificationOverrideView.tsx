import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { ClassificationOverride } from "../../types/api";

export default function ClassificationOverrideView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<ClassificationOverride>(`/api/v1/classification-overrides/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this override?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/classification-overrides/${id}`);
      toast("Classification override deleted.");
      navigate("/classification-override/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={`${item.match_type}: ${item.match_value}`}
      editPath={`/classification-override/${id}/edit`}
      breadcrumbs={entityCrumbs("Overrides", "/classification-override/list", item.match_value)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Match Type", value: item.match_type },
        { label: "Match Value", value: item.match_value },
        { label: "Classification", value: item.classification_type },
        { label: "Notes", value: item.notes },
        { label: "Active", value: item.is_active ? "Yes" : "No" },
        { label: "Created By", value: item.created_by },
      ]}
    />
  );
}
