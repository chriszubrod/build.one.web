import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, deleteEntity } from "../../hooks/useEntity";
import { getOne, post } from "../../api/client";
import { useToast } from "../../components/Toast";
import DetailView from "../../components/DetailView";
import { entityCrumbs } from "../../components/Breadcrumb";
import type { Integration } from "../../types/api";

export default function IntegrationView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { item, loading, error, reload } = useEntityItem<Integration>(`/api/v1/get/integration/${id}`);
  const [deleting, setDeleting] = useState(false);
  const [acting, setActing] = useState(false);

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item) return <div className="page-error">Not found.</div>;

  const handleDelete = async () => {
    if (!confirm("Delete this integration?")) return;
    setDeleting(true);
    try {
      await deleteEntity(`/api/v1/delete/integration/${id}`);
      toast("Integration deleted.");
      navigate("/integration/list");
    } catch (err: any) {
      toast(err.message, "error");
      setDeleting(false);
    }
  };

  const handleConnect = async () => {
    setActing(true);
    try {
      await getOne(`/api/v1/connect/integration/${id}`);
      reload();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setActing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect this integration?")) return;
    setActing(true);
    try {
      await post(`/api/v1/disconnect/integration/${id}`, {});
      reload();
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setActing(false);
    }
  };

  const statusColor = item.status === "connected" ? "#16a34a" : item.status === "error" ? "#dc2626" : "#64748b";

  return (
    <DetailView
      title={item.name}
      editPath={`/integration/${id}/edit`}
      breadcrumbs={entityCrumbs("Integrations", "/integration/list", item.name)}
      onDelete={handleDelete}
      deleting={deleting}
      fields={[
        { label: "Name", value: item.name },
        {
          label: "Status",
          value: <span style={{ color: statusColor, fontWeight: 500, textTransform: "capitalize" }}>{item.status}</span>,
        },
      ]}
    >
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        {item.status !== "connected" && (
          <button className="btn btn-primary" onClick={handleConnect} disabled={acting}>
            {acting ? "Connecting..." : "Connect"}
          </button>
        )}
        {item.status === "connected" && (
          <button className="btn btn-danger" onClick={handleDisconnect} disabled={acting}>
            {acting ? "Disconnecting..." : "Disconnect"}
          </button>
        )}
      </div>
    </DetailView>
  );
}
