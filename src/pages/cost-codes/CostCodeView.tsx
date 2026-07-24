import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { CostCode } from "../../types/api";
import { hasCostCodePermission } from "./costCodePermissions";

export default function CostCodeView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { item, loading, error } = useEntityItem<CostCode>(`/api/v1/get/cost-code/${publicId}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this cost code?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/cost-code/${publicId}`);
      toast("Cost code deleted.");
      navigate("/cost-code/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  // PUT /api/v1/update/cost-code/:publicId — can_update
  const canUpdate = hasCostCodePermission(me, "can_update");
  // DELETE /api/v1/delete/cost-code/:publicId — can_delete
  const canDelete = hasCostCodePermission(me, "can_delete");

  return (
    <DetailView
      title={`${item.number} — ${item.name}`}
      editPath={canUpdate ? `/cost-code/${publicId}/edit` : undefined}
      breadcrumbs={entityCrumbs("Cost Codes", "/cost-code/list", item.number)}
      onDelete={canDelete ? handleDelete : undefined}
      deleting={deleting}
      fields={[
        { label: "Number", value: item.number },
        { label: "Name", value: item.name },
        { label: "Description", value: item.description },
      ]}
    />
  );
}
