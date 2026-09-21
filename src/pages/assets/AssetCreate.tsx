import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import FormField from "../../components/FormField";
import { hasModulePermission } from "../../shared/permissions";
import { createAsset, assetKeys, ASSETS_MODULE } from "../../api/asset";

const ASSET_TYPES = [
  { value: "vehicle", label: "Vehicle" },
  { value: "machinery", label: "Machinery" },
  { value: "equipment", label: "Equipment" },
];

export default function AssetCreate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canCreate = hasModulePermission(me, ASSETS_MODULE, "can_create");

  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("equipment");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [status, setStatus] = useState("active");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [disposalDate, setDisposalDate] = useState("");
  const [qboFixedAssetAccountId, setQboFixedAssetAccountId] = useState("");
  const [qboAccumDepAccountId, setQboAccumDepAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await createAsset({
        name: name.trim(),
        asset_type: assetType,
        make: make.trim() || null,
        model: model.trim() || null,
        model_year: modelYear !== "" ? Number(modelYear) : null,
        serial_number: serialNumber.trim() || null,
        status,
        acquisition_date: acquisitionDate || null,
        disposal_date: disposalDate || null,
        qbo_fixed_asset_account_id: qboFixedAssetAccountId.trim() || null,
        qbo_accum_dep_account_id: qboAccumDepAccountId.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: assetKeys.list });
      toast("Asset created.", "success");
      navigate(`/asset/${created.public_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create asset.");
      setSaving(false);
    }
  };

  // POST /create/asset → can_create (entities/asset/api/router.py)
  if (meLoading) return <div className="page-loading">Loading…</div>;
  if (!canCreate) {
    return (
      <div className="page-error">
        You do not have permission to create assets.
      </div>
    );
  }

  return (
    <div className="page form-page-wide">
      <div className="page-header">
        <h1>New Asset</h1>
      </div>
      <form className="form-card" onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <FormField label="Name" name="name" value={name} onChange={(_, v) => setName(v)} required />

        <div className="form-group">
          <label>Asset type</label>
          <select
            className="inline-li-input"
            value={assetType}
            onChange={(e) => setAssetType(e.target.value)}
            required
          >
            {ASSET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div className="form-header-grid">
          <FormField label="Make" name="make" value={make} onChange={(_, v) => setMake(v)} />
          <FormField label="Model" name="model" value={model} onChange={(_, v) => setModel(v)} />
          <FormField
            label="Model year"
            name="model_year"
            value={modelYear}
            onChange={(_, v) => setModelYear(v)}
            type="number"
          />
          <FormField
            label="Serial / VIN"
            name="serial_number"
            value={serialNumber}
            onChange={(_, v) => setSerialNumber(v)}
          />
        </div>

        <div className="form-group">
          <label>Status</label>
          <select
            className="inline-li-input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
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
              value={acquisitionDate}
              onChange={(e) => setAcquisitionDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Disposal date</label>
            <input
              type="date"
              className="inline-li-input"
              value={disposalDate}
              onChange={(e) => setDisposalDate(e.target.value)}
            />
          </div>
        </div>

        <FormField
          label="QBO fixed-asset account ID"
          name="qbo_fixed_asset_account_id"
          value={qboFixedAssetAccountId}
          onChange={(_, v) => setQboFixedAssetAccountId(v)}
        />
        <FormField
          label="QBO accumulated depreciation account ID"
          name="qbo_accum_dep_account_id"
          value={qboAccumDepAccountId}
          onChange={(_, v) => setQboAccumDepAccountId(v)}
        />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating…" : "Create Asset"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/asset/list")}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
