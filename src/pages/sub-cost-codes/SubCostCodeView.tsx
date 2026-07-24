import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { SubCostCode } from "../../types/api";
import { hasSubCostCodePermission } from "./subCostCodePermissions";

export default function SubCostCodeView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { item, loading, error } = useEntityItem<SubCostCode>(`/api/v1/get/sub-cost-code/${publicId}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this sub cost code?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/sub-cost-code/${publicId}`);
      toast("Sub cost code deleted.");
      navigate("/sub-cost-code/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  // PUT /api/v1/update/sub-cost-code/:publicId — can_update
  const canUpdate = hasSubCostCodePermission(me, "can_update");
  // DELETE /api/v1/delete/sub-cost-code/:publicId — can_delete
  const canDelete = hasSubCostCodePermission(me, "can_delete");

  return (
    <DetailView
      title={`${item.number} — ${item.name}`}
      editPath={canUpdate ? `/sub-cost-code/${publicId}/edit` : undefined}
      breadcrumbs={entityCrumbs("Sub Cost Codes", "/sub-cost-code/list", item.number)}
      onDelete={canDelete ? handleDelete : undefined}
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
