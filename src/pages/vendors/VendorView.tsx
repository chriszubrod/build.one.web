import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import InlineContacts from "../../components/InlineContacts";
import type { Vendor } from "../../types/api";

export default function VendorView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Vendor>(`/api/v1/get/vendor/${id}`);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Vendor not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this vendor?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/vendor/${id}`);
      toast("Vendor deleted.");
      navigate("/vendor/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  return (
    <DetailView
      title={item.name}
      editPath={`/vendor/${id}/edit`}
      breadcrumbs={entityCrumbs("Vendors", "/vendor/list", item.name)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        { label: "Abbreviation", value: item.abbreviation },
        { label: "Contract Labor", value: item.is_contract_labor ? "Yes" : "No" },
        { label: "Status", value: item.is_draft ? "Draft" : "Active" },
      ]}
    >
      <InlineContacts parentEntity="vendor" parentId={item.id} readOnly />
    </DetailView>
  );
}
