import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { VendorType } from "../../types/api";
import { hasVendorTypePermission } from "./vendorTypePermissions";

export default function VendorTypeView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const canDelete = hasVendorTypePermission(me, "can_delete"); // DELETE /api/v1/delete/vendor-type/:publicId
  const { item, loading, error } = useEntityItem<VendorType>(`/api/v1/get/vendor-type/${publicId}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this vendor type?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/vendor-type/${publicId}`);
      toast("Vendor type deleted.");
      navigate("/vendor-type/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={item.name}
      editPath={`/vendor-type/${publicId}/edit`}
      breadcrumbs={entityCrumbs("Vendor Types", "/vendor-type/list", item.name)}
      onDelete={canDelete ? handleDelete : undefined}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        { label: "Description", value: item.description },
      ]}
    />
  );
}
