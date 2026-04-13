import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Company } from "../../types/api";

const columns: Column<Company>[] = [
  { key: "name", label: "Name" },
  { key: "website", label: "Website" },
];

export default function CompanyList() {
  const { items, loading, error } = useEntityList<Company>("/api/v1/get/companies");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Companies" count={items.length} createPath="/company/create" />
      <DataTable columns={columns} data={items} basePath="/company" />
    </div>
  );
}
