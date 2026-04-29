import { Link, useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useEntityItem, updateEntity, deleteEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import { getList, post, del } from "../../api/client";
import Breadcrumb, { entityCrumbs } from "../../components/Breadcrumb";
import FormField from "../../components/FormField";
import InlineContacts from "../../components/InlineContacts";
import type {
  User,
  UserRole,
  Role,
  UserModule,
  Module,
  UserProject,
  Project,
  UserOrganization,
  Organization,
  UserCompany,
  Company,
  OrganizationCompany,
} from "../../types/api";

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error, reload } = useEntityItem<User>(
    `/api/v1/get/user/${id}`,
  );
  const { data: me } = useCurrentUser();
  const isAdmin = !!me?.is_admin;

  // Basics form
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Roles
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleLoading, setRoleLoading] = useState(false);

  // Modules
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [userModules, setUserModules] = useState<UserModule[]>([]);
  const [moduleBusyId, setModuleBusyId] = useState<number | null>(null);

  // Projects
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [userProjects, setUserProjects] = useState<UserProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectLoading, setProjectLoading] = useState(false);

  // Organizations
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [userOrganizations, setUserOrganizations] = useState<UserOrganization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [organizationLoading, setOrganizationLoading] = useState(false);

  // Companies
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [userCompanies, setUserCompanies] = useState<UserCompany[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companyLoading, setCompanyLoading] = useState(false);

  // Organization-Company links (for cross-link filtering)
  const [orgCompanyLinks, setOrgCompanyLinks] = useState<OrganizationCompany[]>(
    [],
  );

  useEffect(() => {
    if (!item) return;
    Promise.all([
      getList<Role>("/api/v1/get/roles"),
      getList<UserRole>(`/api/v1/get/user_roles/user/${item.id}`),
      getList<Module>("/api/v1/get/modules"),
      getList<UserModule>(`/api/v1/get/user_modules/user/${item.id}`),
      getList<Project>("/api/v1/get/projects"),
      getList<UserProject>(`/api/v1/get/user_projects/user/${item.id}`),
      getList<Organization>("/api/v1/get/organizations"),
      getList<UserOrganization>(`/api/v1/get/user_organizations/user/${item.id}`),
      getList<Company>("/api/v1/get/companies"),
      getList<UserCompany>(`/api/v1/get/user_companies/user/${item.id}`),
      getList<OrganizationCompany>("/api/v1/get/organization_companies"),
    ])
      .then(([roles, urs, mods, ums, projects, ups, orgs, uos, companies, ucs, ocs]) => {
        setAllRoles(roles.data);
        setUserRoles(urs.data);
        setAllModules(mods.data);
        setUserModules(ums.data);
        setAllProjects(projects.data);
        setUserProjects(ups.data);
        setAllOrganizations(orgs.data);
        setUserOrganizations(uos.data);
        setAllCompanies(companies.data);
        setUserCompanies(ucs.data);
        setOrgCompanyLinks(ocs.data);
      })
      .catch(() => {});
  }, [item]);

  if (item && !form) {
    setForm({
      firstname: item.firstname,
      lastname: item.lastname ?? "",
      row_version: item.row_version,
    });
  }

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item || !form) return null;

  const onChange = (name: string, value: string) =>
    setForm((prev: any) => ({ ...prev, [name]: value }));

  const handleSaveBasics = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/user/${id}`, {
        row_version: form.row_version,
        firstname: form.firstname,
        lastname: form.lastname || null,
      });
      toast("User saved.");
      reload();
      setForm(null);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this user?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/user/${id}`);
      toast("User deleted.");
      navigate("/user/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  // ---- Roles ----
  const roleMap = new Map(allRoles.map((r) => [r.id, r.name]));
  const assignedRoleIds = new Set(userRoles.map((ur) => ur.role_id));
  const availableRoles = allRoles.filter((r) => !assignedRoleIds.has(r.id));

  const handleAddRole = async () => {
    if (!selectedRoleId) return;
    setRoleLoading(true);
    try {
      const created = await post<UserRole>("/api/v1/create/user_role", {
        user_id: item.id,
        role_id: Number(selectedRoleId),
      });
      setUserRoles((prev) => [...prev, created]);
      setSelectedRoleId("");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setRoleLoading(false);
    }
  };

  const handleRemoveRole = async (ur: UserRole) => {
    if (!confirm(`Remove role "${roleMap.get(ur.role_id) ?? ur.role_id}"?`))
      return;
    try {
      await del(`/api/v1/delete/user_role/${ur.public_id}`);
      setUserRoles((prev) => prev.filter((r) => r.public_id !== ur.public_id));
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // ---- Modules ----
  const userModuleByModuleId = new Map(
    userModules.map((um) => [um.module_id, um]),
  );

  const handleToggleModule = async (mod: Module, checked: boolean) => {
    setModuleBusyId(mod.id);
    try {
      if (checked) {
        const created = await post<UserModule>("/api/v1/create/user_module", {
          user_id: item.id,
          module_id: mod.id,
        });
        setUserModules((prev) => [...prev, created]);
      } else {
        const existing = userModuleByModuleId.get(mod.id);
        if (!existing) return;
        await del(`/api/v1/delete/user_module/${existing.public_id}`);
        setUserModules((prev) =>
          prev.filter((um) => um.public_id !== existing.public_id),
        );
      }
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setModuleBusyId(null);
    }
  };

  // ---- Projects ----
  const projectMap = new Map(allProjects.map((p) => [p.id, p.name]));
  const assignedProjectIds = new Set(userProjects.map((up) => up.project_id));
  const availableProjects = allProjects.filter(
    (p) => !assignedProjectIds.has(p.id),
  );

  const handleAddProject = async () => {
    if (!selectedProjectId) return;
    setProjectLoading(true);
    try {
      const created = await post<UserProject>("/api/v1/create/user_project", {
        user_id: item.id,
        project_id: Number(selectedProjectId),
      });
      setUserProjects((prev) => [...prev, created]);
      setSelectedProjectId("");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setProjectLoading(false);
    }
  };

  // ---- Organizations ----
  const organizationMap = new Map(
    allOrganizations.map((o) => [o.id, o.name]),
  );
  const assignedOrganizationIds = new Set(
    userOrganizations.map((uo) => uo.organization_id),
  );
  const availableOrganizations = allOrganizations.filter(
    (o) => !assignedOrganizationIds.has(o.id),
  );

  const handleAddOrganization = async () => {
    if (!selectedOrganizationId) return;
    setOrganizationLoading(true);
    try {
      const created = await post<UserOrganization>(
        "/api/v1/create/user_organization",
        {
          user_id: item.id,
          organization_id: Number(selectedOrganizationId),
        },
      );
      setUserOrganizations((prev) => [...prev, created]);
      setSelectedOrganizationId("");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setOrganizationLoading(false);
    }
  };

  const handleRemoveOrganization = async (uo: UserOrganization) => {
    if (
      !confirm(
        `Remove organization "${
          organizationMap.get(uo.organization_id) ?? uo.organization_id
        }"?`,
      )
    )
      return;
    try {
      await del(`/api/v1/delete/user_organization/${uo.public_id}`);
      setUserOrganizations((prev) =>
        prev.filter((o) => o.public_id !== uo.public_id),
      );
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  // ---- Companies ----
  const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));
  const assignedCompanyIds = new Set(
    userCompanies.map((uc) => uc.company_id),
  );
  // Filter to companies linked to one of the user's assigned organizations.
  // Existing UserCompany rows are NOT auto-removed if their org is unassigned —
  // this filter only restricts what NEW companies can be added.
  const userOrganizationIds = new Set(
    userOrganizations.map((uo) => uo.organization_id),
  );
  const orgScopedCompanyIds = new Set(
    orgCompanyLinks
      .filter((ocl) => userOrganizationIds.has(ocl.organization_id))
      .map((ocl) => ocl.company_id),
  );
  const availableCompanies = allCompanies.filter(
    (c) => !assignedCompanyIds.has(c.id) && orgScopedCompanyIds.has(c.id),
  );

  const handleAddCompany = async () => {
    if (!selectedCompanyId) return;
    setCompanyLoading(true);
    try {
      const created = await post<UserCompany>(
        "/api/v1/create/user_company",
        {
          user_id: item.id,
          company_id: Number(selectedCompanyId),
        },
      );
      setUserCompanies((prev) => [...prev, created]);
      setSelectedCompanyId("");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setCompanyLoading(false);
    }
  };

  const handleRemoveCompany = async (uc: UserCompany) => {
    if (
      !confirm(
        `Remove company "${companyMap.get(uc.company_id) ?? uc.company_id}"?`,
      )
    )
      return;
    try {
      await del(`/api/v1/delete/user_company/${uc.public_id}`);
      setUserCompanies((prev) =>
        prev.filter((c) => c.public_id !== uc.public_id),
      );
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const handleRemoveProject = async (up: UserProject) => {
    if (
      !confirm(
        `Remove project "${projectMap.get(up.project_id) ?? up.project_id}"?`,
      )
    )
      return;
    try {
      await del(`/api/v1/delete/user_project/${up.public_id}`);
      setUserProjects((prev) =>
        prev.filter((p) => p.public_id !== up.public_id),
      );
    } catch (err: any) {
      toast(err.message, "error");
    }
  };

  const fullName = `${item.firstname} ${item.lastname ?? ""}`.trim();

  return (
    <div className="page">
      <Breadcrumb crumbs={entityCrumbs("Users", "/user/list", fullName)} />
      <div className="page-header">
        <h1>{fullName}</h1>
        <div className="page-header-spacer" />
        {isAdmin && (
          <button
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        )}
      </div>

      {/* User basics */}
      <form className="form-card" onSubmit={handleSaveBasics}>
        <h3 className="line-items-heading">Profile</h3>
        {saveError && <div className="form-error">{saveError}</div>}
        {isAdmin ? (
          <>
            <FormField
              label="First Name"
              name="firstname"
              value={form.firstname}
              onChange={onChange}
              required
            />
            <FormField
              label="Last Name"
              name="lastname"
              value={form.lastname}
              onChange={onChange}
            />
            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        ) : (
          <dl className="detail-fields">
            <div className="detail-row">
              <dt>First Name</dt>
              <dd>{item.firstname}</dd>
            </div>
            <div className="detail-row">
              <dt>Last Name</dt>
              <dd>{item.lastname ?? <span className="text-muted">—</span>}</dd>
            </div>
          </dl>
        )}
      </form>

      {/* Contacts */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <InlineContacts
          parentEntity="user"
          parentId={item.id}
          readOnly={!isAdmin}
        />
      </div>

      {/* Organizations */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <h3 className="line-items-heading">
          Organizations ({userOrganizations.length})
        </h3>

        {userOrganizations.length > 0 && (
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Organization</th>
                {isAdmin && <th style={{ width: 80 }} />}
              </tr>
            </thead>
            <tbody>
              {userOrganizations.map((uo) => (
                <tr key={uo.public_id}>
                  <td>
                    {organizationMap.get(uo.organization_id) ??
                      uo.organization_id}
                  </td>
                  {isAdmin && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemoveOrganization(uo)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {isAdmin && availableOrganizations.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="inline-li-input"
              style={{ maxWidth: 240 }}
              value={selectedOrganizationId}
              onChange={(e) => setSelectedOrganizationId(e.target.value)}
            >
              <option value="">Select organization...</option>
              {availableOrganizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleAddOrganization}
              disabled={!selectedOrganizationId || organizationLoading}
            >
              {organizationLoading ? "Adding..." : "Add Organization"}
            </button>
          </div>
        )}
      </div>

      {/* Companies */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <h3 className="line-items-heading">
          Companies ({userCompanies.length})
        </h3>

        {userCompanies.length > 0 && (
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Company</th>
                {isAdmin && <th style={{ width: 80 }} />}
              </tr>
            </thead>
            <tbody>
              {userCompanies.map((uc) => (
                <tr key={uc.public_id}>
                  <td>{companyMap.get(uc.company_id) ?? uc.company_id}</td>
                  {isAdmin && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemoveCompany(uc)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {isAdmin && userOrganizations.length === 0 && (
          <p className="text-muted">
            Add an Organization first to enable Company selection.
          </p>
        )}

        {isAdmin && userOrganizations.length > 0 && availableCompanies.length === 0 && (
          <p className="text-muted">
            No companies linked to the user's organizations. Link companies on:{" "}
            {userOrganizations
              .map((uo) => {
                const org = allOrganizations.find(
                  (o) => o.id === uo.organization_id,
                );
                if (!org) return null;
                return (
                  <Link
                    key={uo.public_id}
                    to={`/organization/${org.public_id}/edit`}
                  >
                    {org.name}
                  </Link>
                );
              })
              .filter(Boolean)
              .reduce<React.ReactNode[]>((acc, link, i) => {
                if (i > 0) acc.push(", ");
                acc.push(link);
                return acc;
              }, [])}
            .
          </p>
        )}

        {isAdmin && availableCompanies.length > 0 && (
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

      {/* Roles */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <h3 className="line-items-heading">Roles ({userRoles.length})</h3>

        {userRoles.length > 0 && (
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Role</th>
                {isAdmin && <th style={{ width: 80 }} />}
              </tr>
            </thead>
            <tbody>
              {userRoles.map((ur) => (
                <tr key={ur.public_id}>
                  <td>{roleMap.get(ur.role_id) ?? ur.role_id}</td>
                  {isAdmin && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemoveRole(ur)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {isAdmin && availableRoles.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="inline-li-input"
              style={{ maxWidth: 200 }}
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
            >
              <option value="">Select role...</option>
              {availableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleAddRole}
              disabled={!selectedRoleId || roleLoading}
            >
              {roleLoading ? "Adding..." : "Add Role"}
            </button>
          </div>
        )}
      </div>

      {/* Modules (Authorization) */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <h3 className="line-items-heading">
          Modules ({userModules.length})
        </h3>
        <p className="text-muted" style={{ marginTop: -4, marginBottom: 12 }}>
          Additive grants on top of role permissions. Enforcement wiring lands
          in a follow-up wave.
        </p>
        {allModules.length === 0 ? (
          <p className="text-muted">No modules available.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 8,
            }}
          >
            {allModules.map((mod) => {
              const checked = userModuleByModuleId.has(mod.id);
              return (
                <label
                  key={mod.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: isAdmin ? "pointer" : "default",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!isAdmin || moduleBusyId === mod.id}
                    onChange={(e) =>
                      handleToggleModule(mod, e.target.checked)
                    }
                  />
                  <span>{mod.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Projects (Authorization) */}
      <div className="detail-card" style={{ marginTop: 24 }}>
        <h3 className="line-items-heading">
          Projects ({userProjects.length})
        </h3>
        <p className="text-muted" style={{ marginTop: -4, marginBottom: 12 }}>
          Additive grants on top of role permissions. Enforcement wiring lands
          in a follow-up wave.
        </p>

        {userProjects.length > 0 && (
          <table className="data-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Project</th>
                {isAdmin && <th style={{ width: 80 }} />}
              </tr>
            </thead>
            <tbody>
              {userProjects.map((up) => (
                <tr key={up.public_id}>
                  <td>{projectMap.get(up.project_id) ?? up.project_id}</td>
                  {isAdmin && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemoveProject(up)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {isAdmin && availableProjects.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="inline-li-input"
              style={{ maxWidth: 240 }}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="">Select project...</option>
              {availableProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleAddProject}
              disabled={!selectedProjectId || projectLoading}
            >
              {projectLoading ? "Adding..." : "Add Project"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
