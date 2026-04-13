import { useEffect, useState } from "react";
import { getList, post, put, del } from "../api/client";
import type { Contact } from "../types/api";

type ParentEntity = "user" | "company" | "customer" | "project" | "vendor";

interface InlineContactsProps {
  parentEntity: ParentEntity;
  parentId: number;
  readOnly?: boolean;
}

interface ContactForm {
  email: string;
  office_phone: string;
  mobile_phone: string;
  fax: string;
  notes: string;
}

const emptyForm: ContactForm = { email: "", office_phone: "", mobile_phone: "", fax: "", notes: "" };

function toForm(c: Contact): ContactForm {
  return {
    email: c.email ?? "",
    office_phone: c.office_phone ?? "",
    mobile_phone: c.mobile_phone ?? "",
    fax: c.fax ?? "",
    notes: c.notes ?? "",
  };
}

export default function InlineContacts({ parentEntity, parentId, readOnly = false }: InlineContactsProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ContactForm>(emptyForm);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<ContactForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchPath = `/api/v1/get/contacts/${parentEntity}/${parentId}`;
  const parentFkField = `${parentEntity}_id`;

  useEffect(() => {
    setLoading(true);
    getList<Contact>(fetchPath)
      .then((res) => setContacts(res.data))
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [fetchPath]);

  const handleAdd = async () => {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, any> = {
        email: addForm.email || null,
        office_phone: addForm.office_phone || null,
        mobile_phone: addForm.mobile_phone || null,
        fax: addForm.fax || null,
        notes: addForm.notes || null,
        [parentFkField]: parentId,
      };
      const created = await post<Contact>("/api/v1/create/contact", body);
      setContacts((prev) => [...prev, created]);
      setAddForm(emptyForm);
      setShowAdd(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (contact: Contact) => {
    setSaving(true);
    setError("");
    try {
      const updated = await put<Contact>(`/api/v1/update/contact/${contact.public_id}`, {
        row_version: contact.row_version,
        email: editForm.email || null,
        office_phone: editForm.office_phone || null,
        mobile_phone: editForm.mobile_phone || null,
        fax: editForm.fax || null,
        notes: editForm.notes || null,
      });
      setContacts((prev) => prev.map((c) => (c.public_id === contact.public_id ? updated : c)));
      setEditingId(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    if (!confirm("Delete this contact?")) return;
    try {
      await del(`/api/v1/delete/contact/${contact.public_id}`);
      setContacts((prev) => prev.filter((c) => c.public_id !== contact.public_id));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEdit = (contact: Contact) => {
    setEditingId(contact.public_id);
    setEditForm(toForm(contact));
    setShowAdd(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  if (loading) return <div className="text-muted" style={{ marginTop: 24, fontSize: 13 }}>Loading contacts...</div>;

  return (
    <div className="contacts-section">
      <div className="inline-li-header">
        <h3 className="line-items-heading">Contacts ({contacts.length})</h3>
        {!readOnly && !showAdd && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowAdd(true); setEditingId(null); }}>
            + Add Contact
          </button>
        )}
      </div>

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

      {contacts.length > 0 && (
        <table className="data-table" style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Office Phone</th>
              <th>Mobile Phone</th>
              <th>Fax</th>
              <th>Notes</th>
              {!readOnly && <th style={{ width: 120 }} />}
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) =>
              editingId === c.public_id ? (
                <tr key={c.public_id}>
                  <td><input className="inline-li-input" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} /></td>
                  <td><input className="inline-li-input" value={editForm.office_phone} onChange={(e) => setEditForm((f) => ({ ...f, office_phone: e.target.value }))} /></td>
                  <td><input className="inline-li-input" value={editForm.mobile_phone} onChange={(e) => setEditForm((f) => ({ ...f, mobile_phone: e.target.value }))} /></td>
                  <td><input className="inline-li-input" value={editForm.fax} onChange={(e) => setEditForm((f) => ({ ...f, fax: e.target.value }))} /></td>
                  <td><input className="inline-li-input" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} /></td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => handleUpdate(c)} disabled={saving}>Save</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={cancelEdit}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={c.public_id}>
                  <td>{c.email}</td>
                  <td>{c.office_phone}</td>
                  <td>{c.mobile_phone}</td>
                  <td>{c.fax}</td>
                  <td>{c.notes}</td>
                  {!readOnly && (
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(c)}>Edit</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(c)}>Del</button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      {contacts.length === 0 && !showAdd && (
        <div className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>No contacts.</div>
      )}

      {showAdd && (
        <div className="detail-card" style={{ marginTop: 8, padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
            <div className="form-group">
              <label>Email</label>
              <input className="inline-li-input" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Office Phone</label>
              <input className="inline-li-input" value={addForm.office_phone} onChange={(e) => setAddForm((f) => ({ ...f, office_phone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Mobile Phone</label>
              <input className="inline-li-input" value={addForm.mobile_phone} onChange={(e) => setAddForm((f) => ({ ...f, mobile_phone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Fax</label>
              <input className="inline-li-input" value={addForm.fax} onChange={(e) => setAddForm((f) => ({ ...f, fax: e.target.value }))} />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label>Notes</label>
              <input className="inline-li-input" value={addForm.notes} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleAdd} disabled={saving}>
              {saving ? "Adding..." : "Add"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowAdd(false); setAddForm(emptyForm); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
