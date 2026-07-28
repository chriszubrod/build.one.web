import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, removeEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { Address } from "../../types/api";
import { hasAddressPermission } from "./addressPermissions";

export default function AddressView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { item, loading, error } = useEntityItem<Address>(`/api/v1/get/address/${publicId}`);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this address?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/address/${publicId}`);
      await removeEntity(queryClient, {
        listPath: "/api/v1/get/addresses",
        itemPath: `/api/v1/get/address/${publicId}`,
      });
      toast("Address deleted.");
      navigate("/address/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  // PUT /api/v1/update/address/:publicId — VENDORS can_update
  const canUpdate = hasAddressPermission(me, "can_update");
  // DELETE /api/v1/delete/address/:publicId — VENDORS can_delete
  const canDelete = hasAddressPermission(me, "can_delete");

  return (
    <DetailView
      title={item.street_one}
      editPath={canUpdate ? `/address/${publicId}/edit` : undefined}
      breadcrumbs={entityCrumbs("Addresses", "/address/list", item.street_one)}
      onDelete={canDelete ? handleDelete : undefined}
      deleting={deleting}
      fields={[
        { label: "Street 1", value: item.street_one },
        { label: "Street 2", value: item.street_two },
        { label: "City", value: item.city },
        { label: "State", value: item.state },
        { label: "Zip", value: item.zip },
        { label: "Country", value: item.country?.name },
      ]}
    />
  );
}
