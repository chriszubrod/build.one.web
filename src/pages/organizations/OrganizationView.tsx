import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, deleteEntity, removeEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { Organization } from "../../types/api";
import { hasOrganizationPermission } from "./organizationPermissions";
import { useOrganizationCompanies } from "./useOrganizationCompanies";

export default function OrganizationView() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { item, loading, error } = useEntityItem<Organization>(
    `/api/v1/get/organization/${publicId}`,
  );
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();

  const { orgCompanies, companyMap } = useOrganizationCompanies(item);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this organization?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/organization/${publicId}`);
      await removeEntity(queryClient, {
        listPath: "/api/v1/get/organizations",
        itemPath: `/api/v1/get/organization/${publicId}`,
      });
      toast("Organization deleted.");
      navigate("/organization/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  // PUT /api/v1/update/organization/:publicId — can_update
  const canUpdate = hasOrganizationPermission(me, "can_update");
  // DELETE /api/v1/delete/organization/:publicId — can_delete
  const canDelete = hasOrganizationPermission(me, "can_delete");

  return (
    <DetailView
      title={item.name}
      editPath={canUpdate ? `/organization/${publicId}/edit` : undefined}
      breadcrumbs={entityCrumbs("Organizations", "/organization/list", item.name)}
      onDelete={canDelete ? handleDelete : undefined}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        { label: "Website", value: item.website },
      ]}
    >
      <div style={{ marginTop: 24 }}>
        <h3 className="line-items-heading">
          Companies ({orgCompanies.length})
        </h3>
        {orgCompanies.length === 0 ? (
          <p className="text-muted">No companies linked.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
              </tr>
            </thead>
            <tbody>
              {orgCompanies.map((oc) => (
                <tr key={oc.public_id}>
                  <td>{companyMap.get(oc.company_id) ?? oc.company_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DetailView>
  );
}
