import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { ClassificationOverride } from "../../types/api";

const columns: Column<ClassificationOverride>[] = [
  { key: "match_type", label: "Match Type" },
  { key: "match_value", label: "Match Value" },
  { key: "classification_type", label: "Classification" },
  { key: "is_active", label: "Active", render: (v) => (v ? "Yes" : "No") },
];

export default function ClassificationOverrideList() {
  const { items, loading, error } = useEntityList<ClassificationOverride>("/api/v1/classification-overrides");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Classification Overrides" count={items.length} createPath="/classification-override/create" />
      <DataTable columns={columns} data={items} basePath="/classification-override" />
    </div>
  );
}
