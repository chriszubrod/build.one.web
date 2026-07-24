import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, removeEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import InlineContacts from "../../components/InlineContacts";
import type { Company } from "../../types/api";
import { hasCompanyPermission } from "./companyPermissions";

export default function CompanyView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { item, loading, error } = useEntityItem<Company>(`/api/v1/get/company/${publicId}`);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this company?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/company/${publicId}`);
      await removeEntity(queryClient, { listPath: "/api/v1/get/companies", itemPath: `/api/v1/get/company/${publicId}` });
      toast("Company deleted.");
      navigate("/company/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  // PUT /api/v1/update/company/:publicId — can_update
  const canUpdate = hasCompanyPermission(me, "can_update");
  // DELETE /api/v1/delete/company/:publicId — can_delete
  const canDelete = hasCompanyPermission(me, "can_delete");

  return (
    <DetailView
      title={item.name}
      editPath={canUpdate ? `/company/${publicId}/edit` : undefined}
      breadcrumbs={entityCrumbs("Companies", "/company/list", item.name)}
      onDelete={canDelete ? handleDelete : undefined}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        { label: "Website", value: item.website },
      ]}
    >
      <InlineContacts parentEntity="company" parentId={item.id} readOnly />
    </DetailView>
  );
}
