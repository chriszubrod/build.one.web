import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import InlineContacts from "../../components/InlineContacts";
import type { Customer } from "../../types/api";

export default function CustomerView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Customer>(`/api/v1/get/customer/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this customer?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/customer/${id}`);
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
      editPath={`/customer/${id}/edit`}
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
