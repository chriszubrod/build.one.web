import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { hasOrganizationPermission } from "./organizationPermissions";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Organization } from "../../types/api";

const columns: Column<Organization>[] = [
  { key: "name", label: "Name" },
  { key: "website", label: "Website" },
];

export default function OrganizationList() {
  const { items, loading, error } = useEntityList<Organization>("/api/v1/get/organizations");
  const { data: me } = useCurrentUser();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader
        title="Organizations"
        count={items.length}
        // POST /api/v1/create/organization — can_create
        createPath={hasOrganizationPermission(me, "can_create") ? "/organization/create" : undefined}
      />
      <DataTable columns={columns} data={items} basePath="/organization" />
    </div>
  );
}
