import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { ReviewStatus } from "../../types/api";

export default function ReviewStatusView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<ReviewStatus>(`/api/v1/get/review-status/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this review status?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/review-status/${id}`);
      toast("Review status deleted.");
      navigate("/review-status/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={item.name}
      editPath={`/review-status/${id}/edit`}
      breadcrumbs={entityCrumbs("Review Statuses", "/review-status/list", item.name)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        { label: "Description", value: item.description },
        { label: "Sort Order", value: item.sort_order },
        {
          label: "Color",
          value: item.color ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: item.color, display: "inline-block" }} />
              {item.color}
            </span>
          ) : null,
        },
        { label: "Final", value: item.is_final ? "Yes" : "No" },
        { label: "Declined", value: item.is_declined ? "Yes" : "No" },
        { label: "Active", value: item.is_active ? "Yes" : "No" },
      ]}
    />
  );
}
