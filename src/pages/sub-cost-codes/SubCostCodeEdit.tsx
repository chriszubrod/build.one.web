import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, useEntityList, updateEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import type { CostCode, SubCostCode } from "../../types/api";
import { hasSubCostCodePermission } from "./subCostCodePermissions";

export default function SubCostCodeEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canEdit = hasSubCostCodePermission(me, "can_update"); // PUT /api/v1/update/sub-cost-code/:publicId
  const { item, loading, error } = useEntityItem<SubCostCode>(`/api/v1/get/sub-cost-code/${publicId}`);
  const { items: costCodes, loading: costCodesLoading, error: costCodesError } = useEntityList<CostCode>("/api/v1/get/cost-codes");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  // Which row seeded `form`. Router reuses this component across
  // /sub-cost-code/:publicId/edit params, so seeding on `!form` alone would
  // carry row A's values (and row_version) onto row B; keying the seed by
  // public_id re-seeds on row change without clobbering in-progress edits on
  // a background refetch of the same row.
  const [formSeedId, setFormSeedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !costCodesLoading && formSeedId !== item.public_id) {
    setForm({
      number: item.number,
      name: item.name,
      description: item.description ?? "",
      cost_code_public_id: costCodes.find((c) => c.id === item.cost_code_id)?.public_id ?? "",
      aliases: item.aliases ?? "",
      row_version: item.row_version,
    });
    setFormSeedId(item.public_id);
  }

  // With a warm persisted cache the seed can fire from a stale list missing the
  // parent; this patches the prefill in when the background refetch lands, and
  // '' is never a user-selectable value so patching only-'' cannot clobber a choice.
  if (
    item &&
    form &&
    formSeedId === item.public_id &&
    form.cost_code_public_id === ""
  ) {
    const resolvedPublicId = costCodes.find((c) => c.id === item.cost_code_id)?.public_id;
    if (resolvedPublicId) {
      setForm((prev: any) => ({ ...prev, cost_code_public_id: resolvedPublicId }));
    }
  }

  if (loading || meLoading || costCodesLoading) return <div className="page-loading">Loading...</div>;
  if (error || costCodesError) return <div className="page-error">{error || costCodesError}</div>;
  if (!form) return null;

  if (!canEdit) {
    return (
      <div className="page">
        <div className="page-error">You do not have permission to edit this sub cost code.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/sub-cost-code/${publicId}`)}>
          Back to Sub Cost Code
        </button>
      </div>
    );
  }

  const onChange = (name: string, value: string) => setForm((prev: any) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cost_code_public_id) {
      setSaveError("Please select a Cost Code.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/sub-cost-code/${publicId}`, {
        row_version: form.row_version,
        number: form.number,
        name: form.name,
        description: form.description || null,
        cost_code_public_id: form.cost_code_public_id,
        aliases: form.aliases || null,
      });
      navigate(`/sub-cost-code/${publicId}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Sub Cost Code</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Number" name="number" value={form.number} onChange={onChange} required />
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} />
        <SelectField
          label="Cost Code"
          name="cost_code_public_id"
          value={form.cost_code_public_id}
          onChange={onChange}
          options={costCodes.map((cc) => ({
            value: cc.public_id,
            label: `${cc.number} — ${cc.name}`,
          }))}
          required
        />
        <div className="form-field">
          <label htmlFor="aliases">Aliases</label>
          <textarea
            id="aliases"
            name="aliases"
            value={form.aliases}
            onChange={(e) => setForm((prev: any) => ({ ...prev, aliases: e.target.value }))}
            rows={2}
            placeholder="Pipe-delimited shorthand the agent matches against PM-typed values (e.g. '13.1|Lumber & Hardware|materials'). Helps the agent resolve approvals like 'SCC 13.1' or 'Lumber & Hardware' to the right SubCostCode."
          />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/sub-cost-code/${publicId}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
