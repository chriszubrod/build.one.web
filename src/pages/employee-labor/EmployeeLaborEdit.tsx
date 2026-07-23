import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import TextareaField from "../../components/TextareaField";
import type { EmployeeLabor } from "../../types/api";
import { hasEmployeeLaborPermission } from "./employeeLaborPermissions";
import { EDITABLE_STATUS_OPTIONS } from "./employeeLaborStatus";

export default function EmployeeLaborEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  // PUT /api/v1/update/employee-labor/{public_id} — can_update
  const canEdit = hasEmployeeLaborPermission(me, "can_update");
  const { item, loading, error } = useEntityItem<EmployeeLabor>(`/api/v1/get/employee-labor/${publicId}`);
  const { data: lookups } = useLookups("projects,sub_cost_codes");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  // Which row seeded `form`. Router reuses this component across
  // /employee-labor/:publicId/edit params, so seeding on `!form` alone would
  // carry row A's values (and row_version) onto row B; keying the seed by
  // public_id re-seeds on row change without clobbering in-progress edits on
  // a background refetch of the same row.
  const [formSeedId, setFormSeedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && formSeedId !== item.public_id) {
    // Resolve project_id → public_id via lookup (lookup carries no id, so we
    // can't pre-hydrate the project picker). Leave blank; user re-picks if
    // they want to change. The current row's project_id is preserved by
    // CASE WHEN @ProjectId IS NULL on the server.
    const sccMatch = (lookups.sub_cost_codes ?? []).find((s) => s.id === item.sub_cost_code_id);
    setForm({
      project_public_id: "",
      sub_cost_code_public_id: sccMatch?.public_id ?? "",
      description: item.description ?? "",
      total_hours: item.total_hours ?? "",
      hourly_rate: item.hourly_rate ?? "",
      markup: item.markup ?? "",
      total_amount: item.total_amount ?? "",
      status: item.status ?? "pending_review",
      row_version: item.row_version,
    });
    setFormSeedId(item.public_id);
  }

  if (loading || meLoading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item || !form) return <div className="page-error">EmployeeLabor not found.</div>;

  const isLocked = item.status === "invoiced";
  if (isLocked) {
    return (
      <div className="page">
        <div className="page-error">
          This row is invoiced — locked from edits. Reverse the downstream Invoice first.
        </div>
        <button className="btn btn-secondary" onClick={() => navigate(`/employee-labor/${publicId}`)}>Back</button>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="page">
        <div className="page-error">You don&apos;t have permission to edit this employee labor entry.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/employee-labor/${publicId}`)}>
          Back
        </button>
      </div>
    );
  }

  const onChange = (name: string, value: any) => {
    setForm((prev: any) => (prev ? { ...prev, [name]: value } : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/employee-labor/${publicId}`, {
        row_version: form.row_version,
        project_public_id: form.project_public_id || null,
        sub_cost_code_public_id: form.sub_cost_code_public_id || null,
        description: form.description || null,
        total_hours: form.total_hours || null,
        hourly_rate: form.hourly_rate || null,
        markup: form.markup || null,
        total_amount: form.total_amount || null,
        status: form.status,
      });
      navigate(`/employee-labor/${publicId}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Edit Employee Labor</h2>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}

        <SelectField
          label="Project (leave blank to keep current)"
          name="project_public_id"
          value={form.project_public_id}
          onChange={onChange}
          options={(lookups.projects ?? []).map((p: any) => ({
            value: p.public_id,
            label: p.name,
          }))}
        />
        <SelectField
          label="Sub Cost Code"
          name="sub_cost_code_public_id"
          value={form.sub_cost_code_public_id}
          onChange={onChange}
          options={(lookups.sub_cost_codes ?? []).map((s) => ({
            value: s.public_id,
            label: `${s.number} — ${s.name}`,
          }))}
        />
        <FormField label="Total Hours" name="total_hours" value={form.total_hours} onChange={onChange} />
        <FormField label="Hourly Rate" name="hourly_rate" value={form.hourly_rate} onChange={onChange} />
        <FormField label="Markup (decimal)" name="markup" value={form.markup} onChange={onChange} />
        <FormField label="Total Amount" name="total_amount" value={form.total_amount} onChange={onChange} />
        <SelectField
          label="Status"
          name="status"
          value={form.status}
          onChange={onChange}
          options={EDITABLE_STATUS_OPTIONS}
        />
        <TextareaField label="Description" name="description" value={form.description} onChange={onChange} />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/employee-labor/${publicId}`)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
