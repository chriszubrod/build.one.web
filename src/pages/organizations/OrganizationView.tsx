import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import { getList } from "../../api/client";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type {
  Organization,
  Company,
  OrganizationCompany,
} from "../../types/api";

export default function OrganizationView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Organization>(
    `/api/v1/get/organization/${id}`,
  );
  const [deleting, setDeleting] = useState(false);

  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [orgCompanies, setOrgCompanies] = useState<OrganizationCompany[]>([]);

  useEffect(() => {
    if (!item) return;
    Promise.all([
      getList<Company>("/api/v1/get/companies"),
      getList<OrganizationCompany>(
        `/api/v1/get/organization_companies/organization/${item.id}`,
      ),
    ])
      .then(([companies, ocs]) => {
        setAllCompanies(companies.data);
        setOrgCompanies(ocs.data);
      })
      .catch(() => {});
  }, [item]);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this organization?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/organization/${id}`);
      toast("Organization deleted.");
      navigate("/organization/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));

  return (
    <DetailView
      title={item.name}
      editPath={`/organization/${id}/edit`}
      breadcrumbs={entityCrumbs("Organizations", "/organization/list", item.name)}
      onDelete={handleDelete}
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
