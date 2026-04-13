import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem } from "../../hooks/useEntity";
import { put } from "../../api/client";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import SelectField from "../../components/SelectField";
import type { ContractLabor } from "../../types/api";

const STATUS_OPTIONS = [
  { value: "pending_review", label: "Pending Review" },
  { value: "ready", label: "Ready" },
  { value: "billed", label: "Billed" },
];

export default function ContractLaborEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<ContractLabor>(`/api/v1/contract-labor/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    setForm({
      employee_name: item.employee_name,
      vendor_public_id: "", // API needs public_id but response has vendor_id int
      work_date: item.work_date,
      time_in: item.time_in ?? "",
      time_out: item.time_out ?? "",
      break_time: item.break_time ?? "",
      regular_hours: item.regular_hours ?? "",
      overtime_hours: item.overtime_hours ?? "",
      total_hours: item.total_hours,
      hourly_rate: item.hourly_rate ?? "",
      markup: item.markup ?? "",
      description: item.description ?? "",
      status: item.status,
      row_version: item.row_version,
    });
  }

  if (loading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  const onChange = (name: string, value: string) => setForm((prev: any) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await put(`/api/v1/contract-labor/${id}`, {
        row_version: form.row_version,
        employee_name: form.employee_name,
        work_date: form.work_date,
        time_in: form.time_in || null,
        time_out: form.time_out || null,
        break_time: form.break_time || null,
        regular_hours: form.regular_hours !== "" ? Number(form.regular_hours) : null,
        overtime_hours: form.overtime_hours !== "" ? Number(form.overtime_hours) : null,
        total_hours: Number(form.total_hours),
        hourly_rate: form.hourly_rate !== "" ? Number(form.hourly_rate) : null,
        markup: form.markup !== "" ? Number(form.markup) : null,
        description: form.description || null,
        status: form.status,
      });
      navigate(`/contract-labor/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page form-page-wide">
      <div className="page-header"><h1>Edit Contract Labor</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <div className="form-header-grid">
          <FormField label="Employee Name" name="employee_name" value={form.employee_name} onChange={onChange} required />
          <DateField label="Work Date" name="work_date" value={form.work_date} onChange={onChange} required />
          <FormField label="Time In" name="time_in" value={form.time_in} onChange={onChange} />
          <FormField label="Time Out" name="time_out" value={form.time_out} onChange={onChange} />
          <FormField label="Break Time" name="break_time" value={form.break_time} onChange={onChange} />
          <FormField label="Regular Hours" name="regular_hours" value={form.regular_hours} onChange={onChange} type="number" />
          <FormField label="Overtime Hours" name="overtime_hours" value={form.overtime_hours} onChange={onChange} type="number" />
          <FormField label="Total Hours" name="total_hours" value={form.total_hours} onChange={onChange} type="number" required />
          <FormField label="Hourly Rate" name="hourly_rate" value={form.hourly_rate} onChange={onChange} type="number" />
          <FormField label="Markup (decimal, e.g. 0.10)" name="markup" value={form.markup} onChange={onChange} type="number" />
          <SelectField label="Status" name="status" value={form.status} onChange={onChange} options={STATUS_OPTIONS} required />
          <div className="full-width">
            <TextareaField label="Description" name="description" value={form.description} onChange={onChange} />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/contract-labor/${id}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
