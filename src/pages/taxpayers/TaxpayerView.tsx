import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { Taxpayer } from "../../types/api";

export default function TaxpayerView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Taxpayer>(`/api/v1/get/taxpayer/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this taxpayer?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/taxpayer/${id}`);
      toast("Taxpayer deleted.");
      navigate("/taxpayer/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={item.entity_name ?? item.business_name ?? "Taxpayer"}
      editPath={`/taxpayer/${id}/edit`}
      breadcrumbs={entityCrumbs("Taxpayers", "/taxpayer/list", item.entity_name ?? "")}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Entity Name", value: item.entity_name },
        { label: "Business Name", value: item.business_name },
        { label: "Classification", value: item.classification },
        { label: "TIN", value: item.taxpayer_id_number },
        { label: "Signed", value: item.is_signed ? "Yes" : "No" },
        { label: "Signature Date", value: item.signature_date },
      ]}
    />
  );
}
