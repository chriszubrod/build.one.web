import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import { getList, post, del } from "../../api/client";
import FormField from "../../components/FormField";
import type {
  Organization,
  Company,
  OrganizationCompany,
} from "../../types/api";

export default function OrganizationEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error } = useEntityItem<Organization>(
    `/api/v1/get/organization/${id}`,
  );
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Companies in this organization
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [orgCompanies, setOrgCompanies] = useState<OrganizationCompany[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyLoading, setCompanyLoading] = useState(false);

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

  if (item && !form) {
    setForm({
      name: item.name,
      website: item.website ?? "",
      row_version: item.row_version,
    });
  }

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item || !form) return null;

  const onChange = (name: string, value: string) =>
    setForm((prev: any) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/organization/${id}`, {
        row_version: form.row_version,
        name: form.name,
        website: form.website || null,
      });
      navigate(`/organization/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  // ---- Companies ----
  const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));
  const assignedCompanyIds = new Set(orgCompanies.map((oc) => oc.company_id));
  const availableCompanies = allCompanies.filter(
    (c) => !assignedCompanyIds.has(c.id),
  );

  const handleAddCompany = async () => {
    if (!selectedCompanyId) return;
    setCompanyLoading(true);
    try {
      const created = await post<OrganizationCompany>(
        "/api/v1/create/organization_company",
        {
          organization_id: item.id,
          company_id: Number(selectedCompanyId),
        },
      );
      setOrgCompanies((prev) => [...prev, created]);
      setSelectedCompanyId("");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setCompanyLoading(false);
    }
  };

  const handleRemoveCompany = async (oc: OrganizationCompany) => {
    if (
      !confirm(
        `Remove company "${companyMap.get(oc.company_id) ?? oc.company_id}"?`,
      )
    )
      return;
    try {
      await del(`/api/v1/delete/organization_company/${oc.public_id}`);
      setOrgCompanies((prev) =>
        prev.filter((c) => c.public_id !== oc.public_id),
      );
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Edit Organization</h1>
      </div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField
          label="Name"
          name="name"
          value={form.name}
          onChange={onChange}
          required
        />
        <FormField
          label="Website"
          name="website"
          value={form.website}
          onChange={onChange}
        />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(`/organization/${id}`)}
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Companies */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <h3 className="line-items-heading">
          Companies ({orgCompanies.length})
        </h3>

        {orgCompanies.length > 0 && (
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Company</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {orgCompanies.map((oc) => (
                <tr key={oc.public_id}>
                  <td>{companyMap.get(oc.company_id) ?? oc.company_id}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRemoveCompany(oc)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {availableCompanies.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="inline-li-input"
              style={{ maxWidth: 240 }}
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
            >
              <option value="">Select company...</option>
              {availableCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleAddCompany}
              disabled={!selectedCompanyId || companyLoading}
            >
              {companyLoading ? "Adding..." : "Add Company"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
