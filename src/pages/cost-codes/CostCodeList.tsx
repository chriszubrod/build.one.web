import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { hasCostCodePermission } from "./costCodePermissions";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { CostCode } from "../../types/api";

const columns: Column<CostCode>[] = [
  { key: "number", label: "Number" },
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
];

export default function CostCodeList() {
  const { items, loading, error } = useEntityList<CostCode>("/api/v1/get/cost-codes");
  const { data: me } = useCurrentUser();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader
        title="Cost Codes"
        count={items.length}
        createPath={hasCostCodePermission(me, "can_create") ? "/cost-code/create" : undefined}
      />
      <DataTable columns={columns} data={items} basePath="/cost-code" />
    </div>
  );
}
