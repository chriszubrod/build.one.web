import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { AddressType } from "../../types/api";

export default function AddressTypeView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<AddressType>(`/api/v1/get/address_type/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this address type?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/address_type/${id}`);
      toast("Address type deleted.");
      navigate("/address-type/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={item.name}
      editPath={`/address-type/${id}/edit`}
      breadcrumbs={entityCrumbs("Address Types", "/address-type/list", item.name)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        { label: "Description", value: item.description },
        { label: "Display Order", value: item.display_order },
      ]}
    />
  );
}
