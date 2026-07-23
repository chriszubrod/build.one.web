import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { hasVendorTypePermission } from "./vendorTypePermissions";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { VendorType } from "../../types/api";

const columns: Column<VendorType>[] = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
];

export default function VendorTypeList() {
  const { items, loading, error } = useEntityList<VendorType>("/api/v1/get/vendor-types");
  const { data: me } = useCurrentUser();

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader
        title="Vendor Types"
        count={items.length}
        createPath={hasVendorTypePermission(me, "can_create") ? "/vendor-type/create" : undefined}
      />
      <DataTable columns={columns} data={items} basePath="/vendor-type" />
    </div>
  );
}
