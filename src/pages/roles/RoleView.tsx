import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, removeEntity, invalidateLookups } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { Role } from "../../types/api";
import { hasRolePermission } from "./rolePermissions";

export default function RoleView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { item, loading, error } = useEntityItem<Role>(
    `/api/v1/get/role/${publicId}`,
  );
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this role?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/role/${publicId}`);
      await removeEntity(queryClient, {
        listPath: "/api/v1/get/roles",
        itemPath: `/api/v1/get/role/${publicId}`,
      });
      await invalidateLookups(queryClient);
      toast("Role deleted.");
      navigate("/role/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  // PUT /api/v1/update/role/:publicId — can_update
  const canUpdate = hasRolePermission(me, "can_update");
  // DELETE /api/v1/delete/role/:publicId — can_delete
  const canDelete = hasRolePermission(me, "can_delete");

  return (
    <DetailView
      title={item.name}
      editPath={canUpdate ? `/role/${publicId}/edit` : undefined}
      breadcrumbs={entityCrumbs("Roles", "/role/list", item.name)}
      onDelete={canDelete ? handleDelete : undefined}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
      ]}
    />
  );
}
