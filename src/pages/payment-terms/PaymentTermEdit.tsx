import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import type { PaymentTerm } from "../../types/api";
import { hasPaymentTermPermission } from "./paymentTermPermissions";

export default function PaymentTermEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canEdit = hasPaymentTermPermission(me, "can_update"); // PUT /api/v1/update/payment-term/:publicId
  const { item, loading, error } = useEntityItem<PaymentTerm>(`/api/v1/get/payment-term/${publicId}`);
  const [form, setForm] = useState<Record<string, any> | null>(null);
  // Which row seeded `form`. Router reuses this component across
  // /payment-term/:publicId/edit params, so seeding on `!form` alone would
  // carry row A's values (and row_version) onto row B; keying the seed by
  // public_id re-seeds on row change without clobbering in-progress edits on
  // a background refetch of the same row.
  const [formSeedId, setFormSeedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  if (item && formSeedId !== item.public_id) {
    setForm({
      name: item.name ?? "",
      description: item.description ?? "",
      due_days: item.due_days ?? "",
      discount_days: item.discount_days ?? "",
      discount_percent: item.discount_percent ?? "",
      row_version: item.row_version,
    });
    setFormSeedId(item.public_id);
  }

  if (loading || meLoading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!form) return null;

  if (!canEdit) {
    return (
      <div className="page">
        <div className="page-error">You do not have permission to edit this payment term.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/payment-term/${publicId}`)}>
          Back to Payment Term
        </button>
      </div>
    );
  }

  const onChange = (name: string, value: string) => {
    setForm((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/payment-term/${publicId}`, {
        row_version: form.row_version,
        name: form.name || null,
        description: form.description || null,
        due_days: form.due_days !== "" ? Number(form.due_days) : null,
        discount_days: form.discount_days !== "" ? Number(form.discount_days) : null,
        discount_percent: form.discount_percent !== "" ? Number(form.discount_percent) : null,
      });
      navigate(`/payment-term/${publicId}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Payment Term</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} />
        <FormField label="Due Days" name="due_days" value={form.due_days} onChange={onChange} type="number" />
        <FormField label="Discount Days" name="discount_days" value={form.discount_days} onChange={onChange} type="number" />
        <FormField label="Discount %" name="discount_percent" value={form.discount_percent} onChange={onChange} type="number" />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/payment-term/${publicId}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
