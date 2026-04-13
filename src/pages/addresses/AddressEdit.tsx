import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { Address } from "../../types/api";

export default function AddressEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<Address>(`/api/v1/get/address/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    setForm({
      street_one: item.street_one,
      street_two: item.street_two ?? "",
      city: item.city,
      state: item.state,
      zip: item.zip,
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
      await updateEntity(`/api/v1/update/address/${id}`, {
        row_version: form.row_version,
        street_one: form.street_one,
        street_two: form.street_two || null,
        city: form.city,
        state: form.state,
        zip: form.zip,
      });
      navigate(`/address/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Address</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Street 1" name="street_one" value={form.street_one} onChange={onChange} required />
        <FormField label="Street 2" name="street_two" value={form.street_two} onChange={onChange} />
        <FormField label="City" name="city" value={form.city} onChange={onChange} required />
        <FormField label="State" name="state" value={form.state} onChange={onChange} required />
        <FormField label="Zip" name="zip" value={form.zip} onChange={onChange} required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/address/${id}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
