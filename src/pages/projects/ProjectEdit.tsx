import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useEntityItem, updateEntity, deleteEntity } from "../../hooks/useEntity";
import { useToast } from "../../components/Toast";
import { useLookups } from "../../hooks/useLookups";
import FormField from "../../components/FormField";
import SelectField from "../../components/SelectField";
import InlineContacts from "../../components/InlineContacts";
import type { Project } from "../../types/api";

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

export default function ProjectEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { item, loading, error } = useEntityItem<Project>(`/api/v1/get/project/${id}`);
  const { data: lookups } = useLookups("customers");
  const [form, setForm] = useState<Record<string, any> | null>(null);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState(false);

  if (item && !form) {
    setForm({
      name: item.name,
      abbreviation: item.abbreviation ?? "",
      status: item.status ?? "",
      description: item.description ?? "",
      customer_public_id: "",
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
      await updateEntity(`/api/v1/update/project/${id}`, {
        row_version: form.row_version,
        name: form.name,
        description: form.description,
        status: form.status,
        abbreviation: form.abbreviation || null,
        customer_public_id: form.customer_public_id || null,
      });
      navigate(`/project/${id}`);
    } catch (err: any) {
      setSaveError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header"><h1>Edit Project</h1></div>
      <form className="form-card" onSubmit={handleSubmit}>
        {saveError && <div className="form-error">{saveError}</div>}
        <FormField label="Name" name="name" value={form.name} onChange={onChange} required />
        <FormField label="Abbreviation" name="abbreviation" value={form.abbreviation} onChange={onChange} />
        <FormField label="Status" name="status" value={form.status} onChange={onChange} required />
        <FormField label="Description" name="description" value={form.description} onChange={onChange} required />
        <SelectField
          label="Customer"
          name="customer_public_id"
          value={form.customer_public_id}
          onChange={onChange}
          options={(lookups.customers ?? []).map((c) => ({
            value: c.public_id,
            label: c.name,
          }))}
        />
        {item && (
          <div style={{ marginTop: 16, fontSize: 12, color: "var(--color-text-muted)" }}>
            Created: {fmtDate(item.created_datetime)} &nbsp;|&nbsp; Last Modified: {fmtDate(item.modified_datetime)}
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving || deleting}>{saving ? "Saving..." : "Save"}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/project/${id}`)}>Cancel</button>
          <div className="page-header-spacer" />
          <button
            type="button"
            className="btn btn-danger"
            disabled={saving || deleting}
            onClick={async () => {
              if (!confirm("Delete this project? This cannot be undone.")) return;
              setDeleting(true);
              try {
                await deleteEntity(`/api/v1/delete/project/${id}`);
                toast("Project deleted.");
                navigate("/project/list");
              } catch (err: any) {
                toast(err.message, "error");
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </form>
      {item && (
        <div className="detail-card" style={{ marginTop: 24 }}>
          <InlineContacts parentEntity="project" parentId={item.id} />
        </div>
      )}
    </div>
  );
}
