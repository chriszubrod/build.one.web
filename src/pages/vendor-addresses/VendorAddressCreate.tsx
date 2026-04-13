import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { createEntity } from "../../hooks/useEntity";
import FormField from "../../components/FormField";
import type { VendorAddress } from "../../types/api";

export default function VendorAddressCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ vendor_id: "", address_id: "", address_type_id: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const onChange = (name: string, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const created = await createEntity<VendorAddress>("/api/v1/create/vendor_address", {
        vendor_id: form.vendor_id,
        address_id: form.address_id,
        address_type_id: form.address_type_id,
      });
      navigate(`/vendor-address/${created.public_id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Create Vendor Address</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Vendor ID" name="vendor_id" value={form.vendor_id} onChange={onChange} type="text" required />
        <FormField label="Address ID" name="address_id" value={form.address_id} onChange={onChange} type="text" required />
        <FormField label="Address Type ID" name="address_type_id" value={form.address_type_id} onChange={onChange} type="text" required />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Creating..." : "Create"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate("/vendor-address/list")}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
