import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { PaymentTerm } from "../../types/api";

export default function PaymentTermCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    description: "",
    due_days: "",
    discount_days: "",
    discount_percent: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<PaymentTerm>("/api/v1/create/payment-term", {
        name: form.name || null,
        description: form.description || null,
        due_days: form.due_days !== "" ? Number(form.due_days) : null,
        discount_days: form.discount_days !== "" ? Number(form.discount_days) : null,
        discount_percent: form.discount_percent !== "" ? Number(form.discount_percent) : null,
      });
      navigate(`/payment-term/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Create Payment Term</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} />
        <FormField label="Due Days" name="due_days" value={form.due_days} onChange={onChange} type="number" />
        <FormField label="Discount Days" name="discount_days" value={form.discount_days} onChange={onChange} type="number" />
        <FormField label="Discount %" name="discount_percent" value={form.discount_percent} onChange={onChange} type="number" />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/payment-term/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
