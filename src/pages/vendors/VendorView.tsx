import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, removeEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import InlineContacts from "../../components/InlineContacts";
import type { Vendor } from "../../types/api";

export default function VendorView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Vendor>(`/api/v1/get/vendor/${publicId}`);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Vendor not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this vendor?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/vendor/${publicId}`);
      await removeEntity(queryClient, { listPath: "/api/v1/get/vendors", itemPath: `/api/v1/get/vendor/${publicId}` });
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
      editPath={`/vendor/${publicId}/edit`}
      breadcrumbs={entityCrumbs("Vendors", "/vendor/list", item.name)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        { label: "Abbreviation", value: item.abbreviation },
        { label: "Contract Labor", value: item.is_contract_labor ? "Yes" : "No" },
        { label: "Hourly Rate", value: item.hourly_rate ? `$${item.hourly_rate}` : "—" },
        { label: "Markup", value: item.markup ? `${(Number(item.markup) * 100).toFixed(0)}%` : "—" },
        { label: "Status", value: item.is_draft ? "Draft" : "Active" },
        { label: "Notes", value: item.notes || "—" },
      ]}
    >
      <InlineContacts parentEntity="vendor" parentId={item.id} readOnly />
    </DetailView>
  );
}
