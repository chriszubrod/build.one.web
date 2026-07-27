import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, removeEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { ReviewStatus } from "../../types/api";
import { hasReviewStatusPermission } from "./reviewStatusPermissions";

export default function ReviewStatusView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { item, loading, error } = useEntityItem<ReviewStatus>(
    `/api/v1/get/review-status/${publicId}`,
  );
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this review status?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/review-status/${publicId}`);
      await removeEntity(queryClient, {
        listPath: "/api/v1/get/review-statuses",
        itemPath: `/api/v1/get/review-status/${publicId}`,
      });
      toast("Review status deleted.");
      navigate("/review-status/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  // PUT /api/v1/update/review-status/:publicId — can_update
  const canUpdate = hasReviewStatusPermission(me, "can_update");
  // DELETE /api/v1/delete/review-status/:publicId — can_delete
  const canDelete = hasReviewStatusPermission(me, "can_delete");

  return (
    <DetailView
      title={item.name}
      editPath={canUpdate ? `/review-status/${publicId}/edit` : undefined}
      breadcrumbs={entityCrumbs("Review Statuses", "/review-status/list", item.name)}
      onDelete={canDelete ? handleDelete : undefined}
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
