import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { Employee } from "../../types/api";

const columns: Column<Employee>[] = [
  { key: "lastname", label: "Last Name" },
  { key: "firstname", label: "First Name" },
  { key: "email", label: "Email" },
  {
    key: "hourly_rate",
    label: "Rate",
    render: (v) => (v ? `$${v}` : "—"),
  },
  {
    key: "markup",
    label: "Markup",
    render: (v) => (v ? `${(Number(v) * 100).toFixed(0)}%` : "—"),
  },
  {
    key: "is_active",
    label: "Status",
    render: (v) => (v ? "Active" : "Inactive"),
  },
];

export default function EmployeeList() {
  const { items, loading, error } = useEntityList<Employee>("/api/v1/get/employees");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Employees" count={items.length} createPath="/employee/create" />
      <DataTable columns={columns} data={items} basePath="/employee" />
    </div>
  );
}
