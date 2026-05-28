import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import type { EmployeeLabor } from "../../types/api";

function defaultPeriodStart(): string {
  const now = new Date();
  const day = now.getDate();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return day <= 15 ? `${y}-${m}-01` : `${y}-${m}-16`;
}

function defaultPeriodEnd(periodStart: string): string {
  const d = new Date(`${periodStart}T00:00:00`);
  if (d.getDate() === 1) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-15`;
  }
  // 16th — end is last day of month
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

export default function EmployeeLaborCreate() {
  const navigate = useNavigate();
  const { data: lookups } = useLookups("employees,projects,sub_cost_codes");

  const today = new Date().toISOString().slice(0, 10);
  const initialPeriod = defaultPeriodStart();

  const [form, setForm] = useState({
    employee_public_id: "",
    project_public_id: "",
    work_date: today,
    billing_period_start: initialPeriod,
    billing_period_end: defaultPeriodEnd(initialPeriod),
    total_hours: "",
    hourly_rate: "",
    markup: "",
    total_amount: "",
    sub_cost_code_public_id: "",
    description: "",
    status: "pending_review",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: any) => {
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      // Auto-sync billing period when work_date changes
      if (name === "work_date" && value) {
        const d = new Date(`${value}T00:00:00`);
        if (!isNaN(d.getTime())) {
          const day = d.getDate();
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const start = day <= 15 ? `${y}-${m}-01` : `${y}-${m}-16`;
          next.billing_period_start = start;
          next.billing_period_end = defaultPeriodEnd(start);
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<EmployeeLabor>("/api/v1/create/employee-labor", {
        employee_public_id: form.employee_public_id,
        project_public_id: form.project_public_id || null,
        work_date: form.work_date,
        billing_period_start: form.billing_period_start,
        billing_period_end: form.billing_period_end,
        total_hours: form.total_hours || null,
        hourly_rate: form.hourly_rate || null,
        markup: form.markup || null,
        total_amount: form.total_amount || null,
        sub_cost_code_public_id: form.sub_cost_code_public_id || null,
        description: form.description || null,
        status: form.status,
      });
      navigate(`/employee-labor/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Create Employee Labor (Manual)</h2>
      <p className="text-muted" style={{ marginBottom: 12 }}>
        Most rows are auto-aggregated from TimeEntries via submit-for-review.
        Use this form only for manual entries — e.g. backfilling historical
        data or recording labor outside the iOS time-tracking flow.
      </p>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <SelectField
          label="Employee"
          name="employee_public_id"
          value={form.employee_public_id}
          onChange={onChange}
          required
          options={(lookups.employees ?? []).map((e) => ({
            value: e.public_id,
            label: e.label,
          }))}
        />
        <SelectField
          label="Project"
          name="project_public_id"
          value={form.project_public_id}
          onChange={onChange}
          options={(lookups.projects ?? []).map((p: any) => ({
            value: p.public_id,
            label: p.name,
          }))}
        />
        <FormField label="Work Date" name="work_date" value={form.work_date} onChange={onChange} type="date" required />
        <FormField label="Billing Period Start" name="billing_period_start" value={form.billing_period_start} onChange={onChange} type="date" required />
        <FormField label="Billing Period End" name="billing_period_end" value={form.billing_period_end} onChange={onChange} type="date" required />
        <FormField label="Total Hours" name="total_hours" value={form.total_hours} onChange={onChange} placeholder="e.g. 8.00" />
        <FormField label="Hourly Rate (overrides Employee default)" name="hourly_rate" value={form.hourly_rate} onChange={onChange} placeholder="e.g. 75.00" />
        <FormField label="Markup (decimal)" name="markup" value={form.markup} onChange={onChange} placeholder="e.g. 0.50 for 50%" />
        <FormField label="Total Amount (overrides hours × rate × markup)" name="total_amount" value={form.total_amount} onChange={onChange} />
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
        <FormField label="Description" name="description" value={form.description} onChange={onChange} multiline />

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || !form.employee_public_id}>
            {saving ? "Creating..." : "Create"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/employee-labor/list")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
