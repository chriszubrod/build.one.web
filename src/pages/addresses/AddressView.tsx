import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { Address } from "../../types/api";

export default function AddressView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Address>(`/api/v1/get/address/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this address?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/address/${id}`);
      toast("Address deleted.");
      navigate("/address/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={item.street_one}
      editPath={`/address/${id}/edit`}
      breadcrumbs={entityCrumbs("Addresses", "/address/list", item.street_one)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Street 1", value: item.street_one },
        { label: "Street 2", value: item.street_two },
        { label: "City", value: item.city },
        { label: "State", value: item.state },
        { label: "Zip", value: item.zip },
      ]}
    />
  );
}
