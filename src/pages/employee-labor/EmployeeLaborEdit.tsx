import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import type { EmployeeLabor } from "../../types/api";

const STATUS_OPTIONS = [
  { value: "pending_review", label: "Pending Review" },
  { value: "ready", label: "Ready" },
  { value: "invoiced", label: "Invoiced (terminal)" },
];

export default function EmployeeLaborEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<EmployeeLabor>(`/api/v1/get/employee-labor/${id}`);
  const { data: lookups } = useLookups("projects,sub_cost_codes");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
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
  }

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item || !form) return <div className="page-error">EmployeeLabor not found.</div>;

  const isLocked = item.status === "invoiced";
  if (isLocked) {
    return (
      <div className="page">
        <div className="page-error">
          This row is invoiced — locked from edits. Reverse the downstream Invoice first.
        </div>
        <button className="btn btn-secondary" onClick={() => navigate(`/employee-labor/${id}`)}>Back</button>
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
      await updateEntity(`/api/v1/update/employee-labor/${id}`, {
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
      navigate(`/employee-labor/${id}`);
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
          options={STATUS_OPTIONS}
        />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} multiline />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/employee-labor/${id}`)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
