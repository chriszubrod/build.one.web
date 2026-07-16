import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, entityItemKey, entityListKey } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import InlineContacts from "../../components/InlineContacts";
import type { Customer } from "../../types/api";

export default function CustomerView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Customer>(`/api/v1/get/customer/${publicId}`);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this customer?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/customer/${publicId}`);
      queryClient.removeQueries({ queryKey: entityItemKey(`/api/v1/get/customer/${publicId}`) });
      queryClient.invalidateQueries({ queryKey: entityListKey("/api/v1/get/customers") });
      toast("Customer deleted.");
      navigate("/customer/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={item.name}
      editPath={`/customer/${publicId}/edit`}
      breadcrumbs={entityCrumbs("Customers", "/customer/list", item.name)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        { label: "Email", value: item.email },
        { label: "Phone", value: item.phone },
      ]}
    >
      <InlineContacts parentEntity="customer" parentId={item.id} readOnly />
    </DetailView>
  );
}
