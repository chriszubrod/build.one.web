import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { PaymentTerm } from "../../types/api";

export default function PaymentTermView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<PaymentTerm>(`/api/v1/get/payment-term/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this payment term?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/payment-term/${id}`);
      toast("Payment term deleted.");
      navigate("/payment-term/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={item.name ?? "Payment Term"}
      editPath={`/payment-term/${id}/edit`}
      breadcrumbs={entityCrumbs("Payment Terms", "/payment-term/list", item.name ?? "")}
      onDelete={handleDelete}
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
