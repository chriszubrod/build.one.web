import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { ReviewStatus } from "../../types/api";

const columns: Column<ReviewStatus>[] = [
  { key: "sort_order", label: "Order" },
  { key: "name", label: "Name" },
  {
    key: "color",
    label: "Color",
    render: (v) =>
      v ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: String(v), display: "inline-block" }} />
          {String(v)}
        </span>
      ) : (
        ""
      ),
  },
  { key: "is_final", label: "Final", render: (v) => (v ? "Yes" : "No") },
  { key: "is_declined", label: "Declined", render: (v) => (v ? "Yes" : "No") },
  { key: "is_active", label: "Active", render: (v) => (v ? "Yes" : "No") },
];

export default function ReviewStatusList() {
  const { items, loading, error } = useEntityList<ReviewStatus>("/api/v1/get/review-statuses");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Review Statuses" count={items.length} createPath="/review-status/create" />
      <DataTable columns={columns} data={items} basePath="/review-status" />
    </div>
  );
}
