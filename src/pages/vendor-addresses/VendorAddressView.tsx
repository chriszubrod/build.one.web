import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { VendorAddress } from "../../types/api";

export default function VendorAddressView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<VendorAddress>(`/api/v1/get/vendor_address/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this vendor address?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/vendor_address/${id}`);
      toast("Vendor address deleted.");
      navigate("/vendor-address/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title="Vendor Address"
      editPath={`/vendor-address/${id}/edit`}
      breadcrumbs={entityCrumbs("Vendor Addresses", "/vendor-address/list", "Detail")}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Vendor ID", value: item.vendor_id },
        { label: "Address ID", value: item.address_id },
        { label: "Address Type ID", value: item.address_type_id },
      ]}
    />
  );
}
