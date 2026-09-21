import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import {
  fetchAssets,
  assetKeys,
  ASSET_TYPE_LABELS,
  ASSET_STATUS_LABELS,
  assetStatusBadgeClass,
  ASSETS_MODULE,
} from "../../api/asset";
import { hasModulePermission } from "../../shared/permissions";
import type { Asset } from "../../types/api";

function makeModelYear(asset: Asset): string {
  const parts = [asset.make, asset.model].filter((p) => (p ?? "").trim() !== "");
  const mm = parts.join(" ");
  if (asset.model_year != null) {
    return mm ? `${mm} (${asset.model_year})` : String(asset.model_year);
  }
  return mm || "—";
}

export default function AssetList() {
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const canCreate = hasModulePermission(me, ASSETS_MODULE, "can_create");

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: assetKeys.list,
    queryFn: fetchAssets,
  });

  const assets = data ?? [];

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (typeFilter !== "all" && a.asset_type !== typeFilter) return false;
      return true;
    });
  }, [assets, statusFilter, typeFilter]);

  if (isLoading) return <div className="page-loading">Loading…</div>;
  if (error)
    return (
      <div className="page-error">
        {error instanceof Error ? error.message : "Failed to load assets."}
      </div>
    );

  return (
    <div className="page">
      <PageHeader
        title="Assets"
        count={filtered.length}
        createPath={canCreate ? "/asset/create" : undefined}
        createLabel="New Asset"
      />

      <div className="form-header-grid" style={{ marginBottom: 16, maxWidth: 480 }}>
        <div className="form-group">
          <label>Status</label>
          <select
            className="inline-li-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="disposed">Disposed</option>
          </select>
        </div>
        <div className="form-group">
          <label>Type</label>
          <select
            className="inline-li-input"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All types</option>
            <option value="vehicle">Vehicle</option>
            <option value="machinery">Machinery</option>
            <option value="equipment">Equipment</option>
          </select>
        </div>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Make / Model / Year</th>
            <th>Serial / VIN</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((a) => (
            <tr
              key={a.public_id}
              className="clickable-row"
              onClick={() => navigate(`/asset/${a.public_id}`)}
            >
              <td>{a.name}</td>
              <td>{ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type}</td>
              <td>{makeModelYear(a)}</td>
              <td>{a.serial_number?.trim() ? a.serial_number : "—"}</td>
              <td>
                <span className={`status-badge ${assetStatusBadgeClass(a.status)}`}>
                  {ASSET_STATUS_LABELS[a.status] ?? a.status}
                </span>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-state">
                {assets.length === 0
                  ? "No assets yet. Create one when your QBO fixed-asset accounts are ready to map."
                  : "No assets match the selected filters."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
