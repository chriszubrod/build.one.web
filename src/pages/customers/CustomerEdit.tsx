import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import InlineContacts from "../../components/InlineContacts";
import type { Customer } from "../../types/api";

export default function CustomerEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<Customer>(`/api/v1/get/customer/${id}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && !form) {
    setForm({ name: item.name, email: item.email, phone: item.phone, row_version: item.row_version });
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
      await updateEntity(`/api/v1/update/customer/${id}`, {
        row_version: form.row_version,
        name: form.name,
        email: form.email,
        phone: form.phone,
      });
      navigate(`/customer/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Customer</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Email" name="email" value={form.email} onChange={onChange} type="email" required />
        <FormField label="Phone" name="phone" value={form.phone} onChange={onChange} type="tel" required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/customer/${id}`)}>Cancel</button>
        </div>
      </form>
      {item && (
        <div className="detail-card" style={{ marginTop: 24 }}>
          <InlineContacts parentEntity="customer" parentId={item.id} />
        </div>
      )}
    </div>
  );
}
