import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { Address } from "../../types/api";

export default function AddressCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ street_one: "", street_two: "", city: "", state: "", zip: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<Address>("/api/v1/create/address", {
        street_one: form.street_one,
        street_two: form.street_two || null,
        city: form.city,
        state: form.state,
        zip: form.zip,
      });
      navigate(`/address/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Create Address</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Street 1" name="street_one" value={form.street_one} onChange={onChange} required />
        <FormField label="Street 2" name="street_two" value={form.street_two} onChange={onChange} />
        <FormField label="City" name="city" value={form.city} onChange={onChange} required />
        <FormField label="State" name="state" value={form.state} onChange={onChange} required />
        <FormField label="Zip" name="zip" value={form.zip} onChange={onChange} required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/address/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
