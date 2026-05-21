import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { post } from "../../api/client";
import { useEntityList } from "../../hooks/useEntity";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import PageHeader from "../../components/PageHeader";
import type { TimeEntry, User } from "../../types/api";

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function TimeEntryCreate() {
  const navigate = useNavigate();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { toast } = useToast();

  const [userPublicId, setUserPublicId] = useState("");
  const [workDate, setWorkDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const users = useEntityList<User>("/api/v1/get/users").items;
  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        const an = [a.firstname, a.lastname].filter(Boolean).join(" ").toLowerCase();
        const bn = [b.firstname, b.lastname].filter(Boolean).join(" ").toLowerCase();
        return an.localeCompare(bn);
      }),
    [users],
  );

  // Default to self once me + users are loaded
  useEffect(() => {
    if (userPublicId) return;
    if (!me?.user?.public_id) return;
    setUserPublicId(me.user.public_id);
  }, [me, userPublicId]);

  if (meLoading) return <div className="page-loading">Loading...</div>;
  if (me && !me.is_admin) return <Navigate to="/time-entry/list" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userPublicId) {
      setError("Worker is required.");
      return;
    }
    if (!workDate) {
      setError("Work date is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const created = await post<TimeEntry>("/api/v1/time-entries", {
        user_public_id: userPublicId,
        work_date: workDate,
        note: note.trim() || null,
      });
      toast("Time entry created. Add time logs to continue.", "success");
      navigate(`/time-entry/${created.public_id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
      setSubmitting(false);
    }
  }

  return (
    <div className="page form-page-narrow">
      <PageHeader title="New Time Entry">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate("/time-entry/list")}
          disabled={submitting}
        >
          Cancel
        </button>
      </PageHeader>

      <form className="form-card" onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="form-group">
          <label htmlFor="user_public_id">
            Worker<span className="required">*</span>
          </label>
          <select
            id="user_public_id"
            value={userPublicId}
            onChange={(e) => setUserPublicId(e.target.value)}
            required
          >
            <option value="">Select…</option>
            {sortedUsers.map((u) => {
              const name = [u.firstname, u.lastname].filter(Boolean).join(" ").trim() || "Unknown";
              return (
                <option key={u.public_id} value={u.public_id}>
                  {name}
                </option>
              );
            })}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="work_date">
            Work Date<span className="required">*</span>
          </label>
          <input
            id="work_date"
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="note">Worker Note</label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Optional note about the day…"
          />
        </div>

        <div className="form-actions" style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Creating…" : "Create & Add Logs"}
          </button>
        </div>
      </form>
    </div>
  );
}
