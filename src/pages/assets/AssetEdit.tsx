import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import FormField from "../../components/FormField";
import { hasModulePermission } from "../../shared/permissions";
import {
  fetchAsset,
  updateAsset,
  assetKeys,
  ASSETS_MODULE,
} from "../../api/asset";

const ASSET_TYPES = [
  { value: "vehicle", label: "Vehicle" },
  { value: "machinery", label: "Machinery" },
  { value: "equipment", label: "Equipment" },
];

interface AssetFormState {
  row_version: string;
  name: string;
  asset_type: string;
  make: string;
  model: string;
  model_year: string;
  serial_number: string;
  status: string;
  acquisition_date: string;
  disposal_date: string;
  qbo_fixed_asset_account_id: string;
  qbo_accum_dep_account_id: string;
}

function seedForm(item: Awaited<ReturnType<typeof fetchAsset>>): AssetFormState {
  return {
    row_version: item.row_version,
    name: item.name ?? "",
    asset_type: item.asset_type ?? "equipment",
    make: item.make ?? "",
    model: item.model ?? "",
    model_year: item.model_year != null ? String(item.model_year) : "",
    serial_number: item.serial_number ?? "",
    status: item.status ?? "active",
    acquisition_date: item.acquisition_date ?? "",
    disposal_date: item.disposal_date ?? "",
    qbo_fixed_asset_account_id: item.qbo_fixed_asset_account_id ?? "",
    qbo_accum_dep_account_id: item.qbo_accum_dep_account_id ?? "",
  };
}

export default function AssetEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canUpdate = hasModulePermission(me, ASSETS_MODULE, "can_update");

  const id = publicId!;

  const assetQ = useQuery({
    queryKey: assetKeys.detail(id),
    queryFn: () => fetchAsset(id),
    enabled: !!publicId,
  });

  const [form, setForm] = useState<AssetFormState | null>(null);
  const [formSeedId, setFormSeedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const item = assetQ.data;
  if (item && formSeedId !== item.public_id) {
    setForm(seedForm(item));
    setFormSeedId(item.public_id);
  }

  if (assetQ.isLoading || meLoading) return <div className="page-loading">Loading…</div>;
  if (assetQ.error)
    return (
      <div className="page-error">
        {assetQ.error instanceof Error
          ? assetQ.error.message
          : "Failed to load asset."}
      </div>
    );
  if (!form) return null;

  // PUT /update/asset/:publicId → can_update (entities/asset/api/router.py)
  if (!canUpdate) {
    return (
      <div className="page">
        <div className="page-error">You do not have permission to edit this asset.</div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate(`/asset/${publicId}`)}
        >
          Back to Asset
        </button>
      </div>
    );
  }

  const setField = (name: keyof AssetFormState, value: string) => {
    setForm((prev) => (prev ? { ...prev, [name]: value } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await updateAsset(id, {
        row_version: form.row_version,
        name: form.name.trim(),
        asset_type: form.asset_type,
        make: form.make.trim() || null,
        model: form.model.trim() || null,
        model_year: form.model_year !== "" ? Number(form.model_year) : null,
        serial_number: form.serial_number.trim() || null,
        status: form.status,
        acquisition_date: form.acquisition_date || null,
        disposal_date: form.disposal_date || null,
        qbo_fixed_asset_account_id: form.qbo_fixed_asset_account_id.trim() || null,
        qbo_accum_dep_account_id: form.qbo_accum_dep_account_id.trim() || null,
      });
      queryClient.setQueryData(assetKeys.detail(id), {
        ...item,
        ...updated,
        fixed_asset_account_name: item?.fixed_asset_account_name,
        fixed_asset_account_balance: item?.fixed_asset_account_balance,
        accum_dep_account_name: item?.accum_dep_account_name,
        accum_dep_account_balance: item?.accum_dep_account_balance,
      });
      queryClient.invalidateQueries({ queryKey: assetKeys.list });
      toast("Asset saved.", "success");
      navigate(`/asset/${id}`);
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(id) });
      setError(err instanceof Error ? err.message : "Failed to save asset.");
      setSaving(false);
    }
  };

  return (
    <div className="page form-page-wide">
      <div className="page-header">
        <h1>Edit Asset</h1>
      </div>
      <form className="form-card" onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <FormField
          label="Name"
          name="name"
          value={form.name}
          onChange={(_, v) => setField("name", v)}
          required
        />

        <div className="form-group">
          <label>Asset type</label>
          <select
            className="inline-li-input"
            value={form.asset_type}
            onChange={(e) => setField("asset_type", e.target.value)}
            required
          >
            {ASSET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="form-header-grid">
          <FormField label="Make" name="make" value={form.make} onChange={(_, v) => setField("make", v)} />
          <FormField label="Model" name="model" value={form.model} onChange={(_, v) => setField("model", v)} />
          <FormField
            label="Model year"
            name="model_year"
            value={form.model_year}
            onChange={(_, v) => setField("model_year", v)}
            type="number"
          />
          <FormField
            label="Serial / VIN"
            name="serial_number"
            value={form.serial_number}
            onChange={(_, v) => setField("serial_number", v)}
          />
        </div>

        <div className="form-group">
          <label>Status</label>
          <select
            className="inline-li-input"
            value={form.status}
            onChange={(e) => setField("status", e.target.value)}
          >
            <option value="active">Active</option>
            <option value="disposed">Disposed</option>
          </select>
        </div>

        <div className="form-header-grid">
          <div className="form-group">
            <label>Acquisition date</label>
            <input
              type="date"
              className="inline-li-input"
              value={form.acquisition_date}
              onChange={(e) => setField("acquisition_date", e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Disposal date</label>
            <input
              type="date"
              className="inline-li-input"
              value={form.disposal_date}
              onChange={(e) => setField("disposal_date", e.target.value)}
            />
          </div>
        </div>

        <FormField
          label="QBO fixed-asset account ID"
          name="qbo_fixed_asset_account_id"
          value={form.qbo_fixed_asset_account_id}
          onChange={(_, v) => setField("qbo_fixed_asset_account_id", v)}
        />
        <FormField
          label="QBO accumulated depreciation account ID"
          name="qbo_accum_dep_account_id"
          value={form.qbo_accum_dep_account_id}
          onChange={(_, v) => setField("qbo_accum_dep_account_id", v)}
        />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(`/asset/${id}`)}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
