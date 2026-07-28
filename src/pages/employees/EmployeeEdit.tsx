import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityItem, updateEntity, invalidateEntity, invalidateLookups } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import FormField from "../../components/FormField";
import TextareaField from "../../components/TextareaField";
import type { Employee } from "../../types/api";
import { hasEmployeePermission } from "./employeePermissions";

export default function EmployeeEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const canEdit = hasEmployeePermission(me, "can_update"); // PUT /api/v1/update/employee/:publicId
  const { item, loading, error } = useEntityItem<Employee>(
    `/api/v1/get/employee/${publicId}`,
  );
  const [form, setForm] = useState<Record<string, any> | null>(null);
  // Which row seeded `form`. Router reuses this component across
  // /employee/:publicId/edit params, so seeding on `!form` alone would
  // carry row A's values (and row_version) onto row B; keying the seed by
  // public_id re-seeds on row change without clobbering in-progress edits on
  // a background refetch of the same row.
  const [formSeedId, setFormSeedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const queryClient = useQueryClient();

  if (item && formSeedId !== item.public_id) {
    setForm({
      firstname: item.firstname,
      lastname: item.lastname,
      email: item.email ?? "",
      hourly_rate: item.hourly_rate ?? "",
      markup: item.markup ?? "",
      is_active: item.is_active,
      notes: item.notes ?? "",
      row_version: item.row_version,
    });
    setFormSeedId(item.public_id);
  }

  if (loading || meLoading) return <div className="page-loading">Loading...</div>;
  if (error) return <div className="page-error">{error}</div>;
  if (!item || !form) return null;

  if (!canEdit) {
    return (
      <div className="page">
        <div className="page-error">You do not have permission to edit this employee.</div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(`/employee/${publicId}`)}>
          Back to Employee
        </button>
      </div>
    );
  }

  const onChange = (name: string, value: any) => {
    setForm((f) => (f ? { ...f, [name]: value } : f));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      await updateEntity(`/api/v1/update/employee/${publicId}`, {
        row_version: form.row_version,
        firstname: form.firstname,
        lastname: form.lastname,
        email: form.email || null,
        hourly_rate: form.hourly_rate || null,
        markup: form.markup || null,
        is_active: form.is_active,
        notes: form.notes || null,
      });
      await invalidateEntity(queryClient, {
        listPath: "/api/v1/get/employees",
        itemPath: `/api/v1/get/employee/${publicId}`,
      });
      await invalidateLookups(queryClient);
      navigate(`/employee/${publicId}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <h2>Edit Employee</h2>
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
              checked={!!form.is_active}
              onChange={(e) => onChange("is_active", e.target.checked)}
            />{" "}
            Active
          </label>
        </div>
        <TextareaField label="Notes" name="notes" value={form.notes} onChange={onChange} rows={4} />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/employee/${publicId}`)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
