import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, removeEntity, invalidateLookups } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { PaymentTerm } from "../../types/api";
import { hasPaymentTermPermission } from "./paymentTermPermissions";

export default function PaymentTermView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { item, loading, error } = useEntityItem<PaymentTerm>(`/api/v1/get/payment-term/${publicId}`);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this payment term?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/payment-term/${publicId}`);
      await removeEntity(queryClient, {
        listPath: "/api/v1/get/payment-terms",
        itemPath: `/api/v1/get/payment-term/${publicId}`,
      });
      await invalidateLookups(queryClient);
      toast("Payment term deleted.");
      navigate("/payment-term/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  // PUT /api/v1/update/payment-term/:publicId — BILLS can_update
  const canUpdate = hasPaymentTermPermission(me, "can_update");
  // DELETE /api/v1/delete/payment-term/:publicId — BILLS can_delete
  const canDelete = hasPaymentTermPermission(me, "can_delete");

  return (
    <DetailView
      title={item.name ?? "Payment Term"}
      editPath={canUpdate ? `/payment-term/${publicId}/edit` : undefined}
      breadcrumbs={entityCrumbs("Payment Terms", "/payment-term/list", item.name ?? "")}
      onDelete={canDelete ? handleDelete : undefined}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        { label: "Description", value: item.description },
        { label: "Due Days", value: item.due_days },
        { label: "Discount %", value: item.discount_percent },
        { label: "Discount Days", value: item.discount_days },
      ]}
    />
  );
}
