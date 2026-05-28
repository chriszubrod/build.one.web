import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { Employee } from "../../types/api";

export default function EmployeeCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    email: "",
    hourly_rate: "",
    markup: "",
    is_active: true,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: any) => {
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<Employee>("/api/v1/create/employee", {
        firstname: form.firstname,
        lastname: form.lastname,
        email: form.email || null,
        hourly_rate: form.hourly_rate || null,
        markup: form.markup || null,
        is_active: form.is_active,
        notes: form.notes || null,
      });
      navigate(`/employee/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Create Employee</h2>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="First Name" name="firstname" value={form.firstname} onChange={onChange} required />
        <FormField label="Last Name" name="lastname" value={form.lastname} onChange={onChange} required />
        <FormField label="Email" name="email" value={form.email} onChange={onChange} type="email" />
        <FormField label="Hourly Rate" name="hourly_rate" value={form.hourly_rate} onChange={onChange} placeholder="e.g. 75.00" />
        <FormField label="Markup (decimal)" name="markup" value={form.markup} onChange={onChange} placeholder="e.g. 0.50 for 50%" />
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => onChange("is_active", e.target.checked)}
            />{" "}
            Active
          </label>
        </div>
        <FormField label="Notes" name="notes" value={form.notes} onChange={onChange} multiline />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Create"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/employee/list")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
