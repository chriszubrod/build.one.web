import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import {
  fetchBudget,
  fetchBudgetRevisions,
  fetchBudgetRevision,
  fetchBudgetLineItems,
  createLineItem,
  updateLineItem,
  deleteLineItem,
  updateRevision,
  activateBudget,
  approveRevision,
  budgetKeys,
  fmtMoney,
  statusBadgeClass,
  STATUS_LABELS,
} from "../../api/budget";
import { hasModulePermission } from "../../shared/permissions";
import { Modules } from "../../shared/modules";
import type { LookupSubCostCode, BudgetRevision } from "../../types/api";
import "./budget.css";

interface LineRow {
  public_id?: string;
  row_version?: string;
  sub_cost_code_id: string;
  description: string;
  quantity: string;
  rate: string;
  amount: string;
  markup: string;
  price: string;
}

function newRow(): LineRow {
  return {
    sub_cost_code_id: "",
    description: "",
    quantity: "",
    rate: "",
    amount: "",
    markup: "",
    price: "",
  };
}

/** amount = qty x rate; price = amount x (1 + markup). Display-only compute
 * (mirrors BillEdit); the server stores exactly what we send. */
function compute(li: LineRow): LineRow {
  const qty = li.quantity !== "" ? Number(li.quantity) : 0;
  const rate = li.rate !== "" ? Number(li.rate) : 0;
  const markup = li.markup !== "" ? Number(li.markup) : 0;
  const amount = qty * rate;
  const price = amount * (1 + markup);
  return {
    ...li,
    amount: amount ? amount.toFixed(2) : "",
    price: price ? price.toFixed(2) : "",
  };
}

const numOrNull = (s: string): number | null => (s !== "" ? Number(s) : null);

export default function BudgetEdit() {
  const { publicId } = useParams<{ publicId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();
  const { data: lookups } = useLookups("sub_cost_codes");

  const id = publicId!;
  const revParam = searchParams.get("rev");

  const canApprove = hasModulePermission(me, Modules.BUDGETS, "can_approve");

  const budgetQ = useQuery({
    queryKey: budgetKeys.detail(id),
    queryFn: () => fetchBudget(id),
    enabled: !!publicId,
  });
  const revisionsQ = useQuery({
    queryKey: budgetKeys.revisions(id),
    queryFn: () => fetchBudgetRevisions(id),
    enabled: !!publicId,
  });

  // Resolve which revision to edit: explicit ?rev=, else the draft, else the
  // highest revision number.
  const activeRevPublicId = useMemo(() => {
    if (revParam) return revParam;
    const revs = revisionsQ.data ?? [];
    if (revs.length === 0) return null;
    const draft = revs.find((r) => r.status === "draft");
    if (draft) return draft.public_id;
    return [...revs].sort((a, b) => b.revision_number - a.revision_number)[0]
      .public_id;
  }, [revParam, revisionsQ.data]);

  const revisionQ = useQuery({
    queryKey: ["budget-revision", activeRevPublicId],
    queryFn: () => fetchBudgetRevision(activeRevPublicId!),
    enabled: !!activeRevPublicId,
  });
  const lineItemsQ = useQuery({
    queryKey: budgetKeys.lineItems(activeRevPublicId ?? ""),
    queryFn: () => fetchBudgetLineItems(activeRevPublicId!),
    enabled: !!activeRevPublicId,
  });

  const [rows, setRows] = useState<LineRow[]>([]);
  const [origIds, setOrigIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Latest revision row_version, advanced by metadata PUTs so approve uses a
  // fresh token. Lines don't touch the revision row, so this stays valid.
  const revRowVersionRef = useRef<string>("");

  const revision = revisionQ.data;
  const isDraft = revision?.status === "draft";
  const isOriginal = revision?.type === "original";
  const locked = !!revision && !isDraft;

  // Seed local state once the revision + its line items load.
  useEffect(() => {
    if (!revision) return;
    revRowVersionRef.current = revision.row_version;
    setTitle(revision.title ?? "");
    setDescription(revision.description ?? "");
    setEffectiveDate(revision.effective_date ?? "");
    // Re-seed only when the revision identity/version changes — widening to
    // the whole `revision` object would clobber in-progress edits on a
    // background refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision?.public_id, revision?.row_version]);

  useEffect(() => {
    if (!lineItemsQ.data) return;
    const mapped: LineRow[] = lineItemsQ.data.map((li) => ({
      public_id: li.public_id,
      row_version: li.row_version,
      sub_cost_code_id:
        li.sub_cost_code_id != null ? String(li.sub_cost_code_id) : "",
      description: li.description ?? "",
      quantity: li.quantity ?? "",
      rate: li.rate ?? "",
      amount: li.amount ?? "",
      markup: li.markup ?? "",
      price: li.price ?? "",
    }));
    setRows(mapped);
    setOrigIds(mapped.filter((r) => r.public_id).map((r) => r.public_id!));
  }, [lineItemsQ.data]);

  const sccOptions = (lookups?.sub_cost_codes ?? []) as LookupSubCostCode[];

  const updateField = (idx: number, key: keyof LineRow, value: string) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? compute({ ...r, [key]: value }) : r)),
    );
  };
  const removeRow = (idx: number) =>
    setRows((prev) => prev.filter((_, i) => i !== idx));
  const addRow = () => setRows((prev) => [...prev, newRow()]);

  /** Persist revision metadata (CO only) + sync line items. Returns ok. */
  const saveAll = async (): Promise<boolean> => {
    if (!revision) return false;
    setSaving(true);
    setError("");
    try {
      // Revision metadata — only change orders carry editable title/desc/date.
      if (!isOriginal) {
        const updatedRev = await updateRevision(revision.public_id, {
          row_version: revRowVersionRef.current,
          title: title.trim() || null,
          description: description.trim() || null,
          effective_date: effectiveDate || null,
        });
        revRowVersionRef.current = updatedRev.row_version;
      }

      // Deletes: rows present originally but no longer in the grid.
      const currentIds = new Set(
        rows.filter((r) => r.public_id).map((r) => r.public_id),
      );
      for (const oid of origIds) {
        if (!currentIds.has(oid)) await deleteLineItem(oid);
      }

      // Creates + updates.
      const saved: LineRow[] = [];
      for (const r of rows) {
        const body = {
          sub_cost_code_id: r.sub_cost_code_id !== "" ? Number(r.sub_cost_code_id) : null,
          description: r.description.trim() || null,
          quantity: numOrNull(r.quantity),
          rate: numOrNull(r.rate),
          amount: numOrNull(r.amount),
          markup: numOrNull(r.markup),
          price: numOrNull(r.price),
        };
        if (r.public_id) {
          const res = await updateLineItem(r.public_id, {
            ...body,
            row_version: r.row_version!,
          });
          saved.push({ ...r, row_version: res.row_version });
        } else {
          const res = await createLineItem({
            budget_revision_public_id: revision.public_id,
            ...body,
          });
          saved.push({ ...r, public_id: res.public_id, row_version: res.row_version });
        }
      }
      setRows(saved);
      setOrigIds(saved.filter((r) => r.public_id).map((r) => r.public_id!));
      // Await the refetch so saveAll fully settles before a terminal action
      // (activate/approve) proceeds — and so a re-entry shows persisted state
      // without racing a stale-cache re-seed.
      await queryClient.invalidateQueries({
        queryKey: budgetKeys.lineItems(revision.public_id),
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (await saveAll()) toast("Saved.", "success");
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: budgetKeys.detail(id) });
    queryClient.invalidateQueries({ queryKey: budgetKeys.variance(id) });
    queryClient.invalidateQueries({ queryKey: budgetKeys.revisions(id) });
    queryClient.invalidateQueries({ queryKey: budgetKeys.list });
  };

  const handleActivate = async () => {
    if (!budgetQ.data) return;
    if (!confirm("Activate this budget? The original revision locks once approved."))
      return;
    if (!(await saveAll())) return;
    setSaving(true);
    try {
      // Activate uses the BUDGET row_version, not the revision's — saving
      // line items never bumps the Budget row, so the loaded value stays
      // valid. ActivateBudgetById approves Rev 0 atomically server-side.
      await activateBudget(id, budgetQ.data.row_version);
      invalidateAll();
      toast("Budget activated.", "success");
      navigate(`/budget/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate.");
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!revision) return;
    if (!confirm("Approve this change order? Approved revisions are locked."))
      return;
    if (!(await saveAll())) return;
    setSaving(true);
    try {
      await approveRevision(revision.public_id, revRowVersionRef.current);
      invalidateAll();
      toast("Change order approved.", "success");
      navigate(`/budget/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve.");
      setSaving(false);
    }
  };

  if (budgetQ.isLoading || revisionsQ.isLoading || revisionQ.isLoading)
    return <div className="page-loading">Loading…</div>;
  if (budgetQ.error || revisionQ.error)
    return (
      <div className="page-error">
        {(budgetQ.error ?? revisionQ.error) instanceof Error
          ? (budgetQ.error ?? revisionQ.error)!.message
          : "Failed to load."}
      </div>
    );
  if (!revision)
    return <div className="page-error">No revision to edit.</div>;

  const budget = budgetQ.data!;
  const rev: BudgetRevision = revision;

  return (
    <div className="page budget-page">
      <div className="budget-detail-head">
        <h1>
          {budget.project_name ?? "Budget"} —{" "}
          {isOriginal ? "Original Budget" : `Change Order #${rev.revision_number}`}
        </h1>
        <span className={`status-badge ${statusBadgeClass(rev.status)}`}>
          {STATUS_LABELS[rev.status] ?? rev.status}
        </span>
        <div className="page-header-spacer" />
        <Link to={`/budget/${id}`} className="btn btn-secondary btn-sm">
          Back to Budget
        </Link>
      </div>

      {locked && (
        <div className="locked-banner">
          This revision is approved and locked — line items are read-only.
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      {/* Change-order metadata */}
      {!isOriginal && (
        <div className="form-card" style={{ maxWidth: "none", marginBottom: 16 }}>
          <div className="form-header-grid">
            <div className="form-group">
              <label>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={locked}
              />
            </div>
            <div className="form-group">
              <label>Effective date</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                disabled={locked}
              />
            </div>
            <div className="form-group full-width">
              <label>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                disabled={locked}
              />
            </div>
          </div>
        </div>
      )}

      {/* Line-item grid */}
      <div className="inline-li-header">
        <h3 className="line-items-heading">
          Schedule of Values ({rows.length})
        </h3>
        {!locked && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={addRow}>
            + Add Line
          </button>
        )}
      </div>

      {rows.map((li, idx) => (
        <div className="li-card" key={li.public_id ?? `new-${idx}`}>
          <div className="li-card-header">
            <span className="li-card-num">#{idx + 1}</span>
            {!locked && (
              <button
                type="button"
                className="inline-li-remove btn btn-danger btn-sm"
                onClick={() => removeRow(idx)}
              >
                Remove
              </button>
            )}
          </div>
          <div className="li-card-row">
            <div className="li-card-field" style={{ flex: 3 }}>
              <label className="li-card-field-label">Sub Cost Code</label>
              <select
                className="inline-li-input"
                value={li.sub_cost_code_id}
                onChange={(e) => updateField(idx, "sub_cost_code_id", e.target.value)}
                disabled={locked}
              >
                <option value="">—</option>
                {sccOptions.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.number} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="li-card-field" style={{ flex: 3 }}>
              <label className="li-card-field-label">Description</label>
              <input
                className="inline-li-input"
                value={li.description}
                onChange={(e) => updateField(idx, "description", e.target.value)}
                disabled={locked}
              />
            </div>
          </div>
          <div className="li-card-row">
            <div className="li-card-field">
              <label className="li-card-field-label">Qty</label>
              <input
                className="inline-li-input"
                type="number"
                step="any"
                value={li.quantity}
                onChange={(e) => updateField(idx, "quantity", e.target.value)}
                disabled={locked}
              />
            </div>
            <div className="li-card-field">
              <label className="li-card-field-label">Rate</label>
              <input
                className="inline-li-input"
                type="number"
                step="any"
                value={li.rate}
                onChange={(e) => updateField(idx, "rate", e.target.value)}
                disabled={locked}
              />
            </div>
            <div className="li-card-field">
              <label className="li-card-field-label">Amount (cost)</label>
              <span className="inline-li-computed">{fmtMoney(li.amount)}</span>
            </div>
            <div className="li-card-field">
              <label className="li-card-field-label">Markup</label>
              <input
                className="inline-li-input"
                type="number"
                step="any"
                value={li.markup}
                onChange={(e) => updateField(idx, "markup", e.target.value)}
                disabled={locked}
              />
            </div>
            <div className="li-card-field">
              <label className="li-card-field-label">Price (contract)</label>
              <span className="inline-li-computed">{fmtMoney(li.price)}</span>
            </div>
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <div className="detail-card" style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
          No lines yet. {!locked && 'Click "+ Add Line" to start the schedule of values.'}
        </div>
      )}

      {!locked && (
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {isOriginal && budget.status === "draft" && canApprove && (
            <button type="button" className="btn btn-success" onClick={handleActivate} disabled={saving}>
              Save &amp; Activate Budget
            </button>
          )}
          {!isOriginal && canApprove && (
            <button type="button" className="btn btn-success" onClick={handleApprove} disabled={saving}>
              Save &amp; Approve Change Order
            </button>
          )}
        </div>
      )}
    </div>
  );
}
