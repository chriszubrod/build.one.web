import { useEntityList } from "../../hooks/useEntity";
import DataTable, { type Column } from "../../components/DataTable";
import PageHeader from "../../components/PageHeader";
import type { User } from "../../types/api";

const columns: Column<User>[] = [
  { key: "firstname", label: "First Name" },
  { key: "lastname", label: "Last Name" },
];

export default function UserList() {
  const { items, loading, error } = useEntityList<User>("/api/v1/get/users");

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;

  return (
    <div className="page">
      <PageHeader title="Users" count={items.length} createPath="/user/create" />
      <DataTable columns={columns} data={items} basePath="/user" />
    </div>
  );
}
