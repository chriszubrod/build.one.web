import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import { hasModulePermission } from "../../shared/permissions";
import { Modules } from "../../shared/modules";
import { createBudget, budgetKeys } from "../../api/budget";
import type { LookupProject } from "../../types/api";

export default function BudgetCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const { data: lookups, loading } = useLookups("projects");
  const canCreate = hasModulePermission(me, Modules.BUDGETS, "can_create");

  const [projectPublicId, setProjectPublicId] = useState(
    () => searchParams.get("project_public_id") ?? "",
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const projects = (lookups.projects ?? []) as LookupProject[];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectPublicId) {
      setError("Select a project.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await createBudget({
        project_public_id: projectPublicId,
        notes: notes.trim() || null,
      });
      queryClient.invalidateQueries({ queryKey: budgetKeys.list });
      toast("Budget created. Add your schedule of values.", "success");
      // Land on the edit page for the auto-created original revision (Rev 0).
      navigate(
        `/budget/${created.public_id}/edit?rev=${created.original_revision.public_id}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create budget.");
      setSaving(false);
    }
  };

  // POST /create/budget → can_create (entities/budget/api/router.py)
  if (meLoading) return <div className="page-loading">Loading…</div>;
  if (!canCreate) {
    return (
      <div className="page-error">
        You do not have permission to create budgets.
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>New Budget</h1>
      </div>
      <form className="form-card" onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        <div className="form-group">
          <label>Project</label>
          <select
            className="inline-li-input"
            value={projectPublicId}
            onChange={(e) => setProjectPublicId(e.target.value)}
            disabled={loading}
            required
          >
            <option value="">{loading ? "Loading…" : "Select a project…"}</option>
            {projects.map((p) => (
              <option key={p.public_id} value={p.public_id}>
                {p.abbreviation ? `${p.abbreviation} — ${p.name}` : p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Creating…" : "Create Budget"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate("/budget/list")}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
