import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { hasCompanyPermission } from "./companyPermissions";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Company } from "../../types/api";

const columns: Column<Company>[] = [
  { key: "name", label: "Name" },
  { key: "website", label: "Website" },
];

export default function CompanyList() {
  const { items, loading, error } = useEntityList<Company>("/api/v1/get/companies");
  const { data: me } = useCurrentUser();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader
        title="Companies"
        count={items.length}
        createPath={hasCompanyPermission(me, "can_create") ? "/company/create" : undefined}
      />
      <DataTable columns={columns} data={items} basePath="/company" />
    </div>
  );
}
