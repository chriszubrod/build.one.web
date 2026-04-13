import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { post } from "../../api/client";
import FormField from "../../components/FormField";
import DateField from "../../components/DateField";
import TextareaField from "../../components/TextareaField";
import type { ContractLabor } from "../../types/api";

export default function ContractLaborCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    vendor_public_id: "",
    employee_name: "",
    work_date: "",
    time_in: "",
    time_out: "",
    break_time: "",
    regular_hours: "",
    overtime_hours: "",
    total_hours: "",
    hourly_rate: "",
    markup: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await post<ContractLabor>("/api/v1/contract-labor", {
        vendor_public_id: form.vendor_public_id,
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
      });
      navigate(`/contract-labor/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page form-page-wide">
      <div className="page-header"><h1>Create Contract Labor</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <div className="form-header-grid">
          <FormField label="Vendor Public ID" name="vendor_public_id" value={form.vendor_public_id} onChange={onChange} required />
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
          <div className="full-width">
            <TextareaField label="Description" name="description" value={form.description} onChange={onChange} />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/contract-labor/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
