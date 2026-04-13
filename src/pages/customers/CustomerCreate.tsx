import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { Customer } from "../../types/api";

export default function CustomerCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<Customer>("/api/v1/create/customer", {
        name: form.name,
        email: form.email,
        phone: form.phone,
      });
      navigate(`/customer/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Create Customer</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Email" name="email" value={form.email} onChange={onChange} type="email" required />
        <FormField label="Phone" name="phone" value={form.phone} onChange={onChange} type="tel" required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/customer/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
