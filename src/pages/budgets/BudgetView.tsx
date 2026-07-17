import { Fragment, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { useIdNameMap } from "../../hooks/useIdNameMap";
import { useLookups } from "../../hooks/useLookups";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useToast } from "../../components/Toast";
import MoneyCell from "../../components/MoneyCell";
import {
  fetchBudget,
  fetchBudgetVariance,
  fetchBudgetRevisions,
  fetchBudgetLineItems,
  updateBudget,
  createRevision,
  budgetKeys,
  fmtMoney,
  signClass,
  statusBadgeClass,
  STATUS_LABELS,
  BUDGETS_MODULE,
} from "../../api/budget";
import { buildLedger, centsToAmount } from "./revisionLedger";
import type {
  BudgetVarianceMoney,
  BudgetVarianceRow,
  BudgetLineItem,
  LookupSubCostCode,
  User,
} from "../../types/api";
import "./budget.css";

function compactName(
  firstname?: string | null,
  lastname?: string | null,
): string {
  const f = (firstname ?? "").trim();
  const l = (lastname ?? "").trim();
  return [f, l].filter(Boolean).join(" ") || "User";
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString("en-US");
}

/** The shared money columns rendered for group / scc / totals rows. */
function moneyCells(m: BudgetVarianceMoney, totals = false) {
  const unpriced = Number(m.unpriced_labor_hours);
  return (
    <>
      <td className="num">{fmtMoney(m.budget_amount)}</td>
      <td className="num">
        {fmtMoney(m.actual_cost)}
        {!totals && unpriced > 0 && (
          <span
            className="unpriced-chip"
            title={`${unpriced} labor hours not yet priced — cost understated`}
          >
            {unpriced}h
          </span>
        )}
      </td>
      <td className={`num ${signClass(m.cost_variance)}`}>
        {fmtMoney(m.cost_variance)}
      </td>
      <td className="num">{fmtMoney(m.budget_price)}</td>
      <td className="num">{fmtMoney(m.drawn_price)}</td>
      <td className={`num ${signClass(m.remaining_to_draw)}`}>
        {fmtMoney(m.remaining_to_draw)}
      </td>
    </>
  );
}

interface BudgetViewContentProps {
  /**
   * Budget.PublicId. When this content is rendered as a route-level page,
   * the wrapper passes the value from useParams; when it's rendered as an
   * embedded tab (e.g. ProjectDetailScreen → Budget tab), the caller
   * resolves it via GET /get/budget/by-project/{project_public_id} and
   * passes it directly.
   */
  publicId: string;
}

/**
 * The Budget detail content — reusable inside a tab or as a full page.
 * Page-level wrapper is below as the default export.
 */
export function BudgetViewContent({ publicId }: BudgetViewContentProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useCurrentUser();

  const mod = me?.modules?.find((m) => m.name === BUDGETS_MODULE);
  const canCreate = !!(me?.is_admin || mod?.can_create);
  const canUpdate = !!(me?.is_admin || mod?.can_update);

  const id = publicId;

  const budgetQ = useQuery({
    queryKey: budgetKeys.detail(id),
    queryFn: () => fetchBudget(id),
    enabled: !!publicId,
  });
  const varianceQ = useQuery({
    queryKey: budgetKeys.variance(id),
    queryFn: () => fetchBudgetVariance(id),
    enabled: !!publicId,
  });
  const revisionsQ = useQuery({
    queryKey: budgetKeys.revisions(id),
    queryFn: () => fetchBudgetRevisions(id),
    enabled: !!publicId,
  });

  const revisions = revisionsQ.data ?? [];

  // One fan-out query per revision (all in parallel). `combine` folds the
  // per-revision line items + load/error status into stable-identity maps via
  // react-query's replaceEqualDeep — so `ledger` (and the render) only recompute
  // when line-item data actually changes, not on every unrelated re-render.
  const { lineItemsByRevision, lineItemStatusByRevision } = useQueries({
    queries: revisions.map((r) => ({
      queryKey: budgetKeys.lineItems(r.public_id),
      queryFn: () => fetchBudgetLineItems(r.public_id),
      enabled: !!r.public_id,
    })),
    combine: (results) => {
      const byRevision: Record<string, BudgetLineItem[] | undefined> = {};
      const statusByRevision: Record<
        string,
        { loading: boolean; error: boolean }
      > = {};
      revisions.forEach((r, i) => {
        byRevision[r.public_id] = results[i]?.data;
        statusByRevision[r.public_id] = {
          loading: results[i]?.isLoading ?? false,
          error: results[i]?.isError ?? false,
        };
      });
      return {
        lineItemsByRevision: byRevision,
        lineItemStatusByRevision: statusByRevision,
      };
    },
  });

  const userName = useIdNameMap<User>(
    "/api/v1/get/users?page_size=500",
    (u) => compactName(u.firstname, u.lastname),
  );

  const ledger = useMemo(
    () => buildLedger(revisions, lineItemsByRevision),
    [revisions, lineItemsByRevision],
  );

  const { data: lookups } = useLookups("sub_cost_codes");
  const sccMap = useMemo(() => {
    const m = new Map<number, LookupSubCostCode>();
    (lookups?.sub_cost_codes ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [lookups?.sub_cost_codes]);

  // Notes inline edit.
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [creatingCo, setCreatingCo] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (publicId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
  };

  if (budgetQ.isLoading || varianceQ.isLoading)
    return <div className="page-loading">Loading…</div>;
  const loadError = budgetQ.error ?? varianceQ.error;
  if (loadError)
    return (
      <div className="page-error">
        {loadError instanceof Error
          ? loadError.message
          : "Failed to load budget."}
      </div>
    );

  const budget = budgetQ.data!;
  const variance = varianceQ.data;

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const updated = await updateBudget(id, {
        row_version: budget.row_version,
        notes: notesDraft.trim() || null,
      });
      queryClient.setQueryData(budgetKeys.detail(id), updated);
      queryClient.invalidateQueries({ queryKey: budgetKeys.list });
      setEditingNotes(false);
      toast("Notes saved.", "success");
    } catch (err) {
      // Refetch so a retry binds to a fresh row_version (e.g. after a
      // concurrent edit returned 409).
      queryClient.invalidateQueries({ queryKey: budgetKeys.detail(id) });
      toast(err instanceof Error ? err.message : "Failed to save notes.", "error");
    } finally {
      setSavingNotes(false);
    }
  };

  const addChangeOrder = async () => {
    setCreatingCo(true);
    try {
      const co = await createRevision({
        budget_public_id: id,
        type: "change_order",
      });
      queryClient.invalidateQueries({ queryKey: budgetKeys.revisions(id) });
      navigate(`/budget/${id}/edit?rev=${co.public_id}`);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to create change order.",
        "error",
      );
      setCreatingCo(false);
    }
  };

  // Group variance rows by cost code (server pre-sorted: uncategorized last).
  const rowsByCostCode = new Map<number | null, BudgetVarianceRow[]>();
  for (const r of variance?.rows ?? []) {
    const key = r.cost_code_id;
    const arr = rowsByCostCode.get(key) ?? [];
    arr.push(r);
    rowsByCostCode.set(key, arr);
  }

  const uncategorizedDrawn = Number(
    variance?.cost_codes.find((c) => c.uncategorized)?.drawn_price ?? "0",
  );
  const showUncatNote = uncategorizedDrawn !== 0;

  return (
    <div className="page budget-page">
      <div className="budget-detail-head">
        <h1>{budget.project_name ?? "Budget"}</h1>
        <span className={`status-badge ${statusBadgeClass(budget.status)}`}>
          {STATUS_LABELS[budget.status] ?? budget.status}
        </span>
        <div className="page-header-spacer" />
        <Link to="/budget/list" className="btn btn-secondary btn-sm">
          All Budgets
        </Link>
      </div>

      {/* Notes */}
      <div className="budget-detail-sub">
        {editingNotes ? (
          <div style={{ maxWidth: 600 }}>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={2}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={saveNotes}
                disabled={savingNotes}
              >
                {savingNotes ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setEditingNotes(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {budget.notes || <span style={{ fontStyle: "italic" }}>No notes</span>}
            {canUpdate && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  setNotesDraft(budget.notes ?? "");
                  setEditingNotes(true);
                }}
              >
                Edit notes
              </button>
            )}
          </>
        )}
      </div>

      {budget.status === "draft" && (
        <div className="budget-note">
          This budget is a draft. Contract values stay at $0 until you add the
          original schedule of values and activate it (from the revision below).
        </div>
      )}

      {showUncatNote && (
        <div className="budget-note">
          Most drawn value currently sits in the <strong>Uncategorized</strong>{" "}
          row — invoice lines pulled from QuickBooks carry no sub cost code, so
          they can&apos;t be attributed per line. Read drawn totals at the
          budget level, not per cost code, until those lines are categorized.
        </div>
      )}

      {/* Variance consolidation */}
      <table className="data-table variance-table">
        <thead>
          <tr>
            <th>Cost Code / Sub Cost Code</th>
            <th className="num">Budget Cost</th>
            <th className="num">Actual Cost</th>
            <th className="num">Cost Var</th>
            <th className="num">Contract</th>
            <th className="num">Drawn</th>
            <th className="num">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {(variance?.cost_codes ?? []).map((cc) => {
            const groupRows = rowsByCostCode.get(cc.cost_code_id) ?? [];
            const key = cc.cost_code_id ?? "uncat";
            return (
              <Fragment key={`cc-${key}`}>
                <tr
                  className={`cc-group${cc.uncategorized ? " uncategorized" : ""}`}
                >
                  <td className="label">
                    {cc.uncategorized
                      ? "Uncategorized"
                      : `${cc.cost_code_number ?? ""} — ${cc.cost_code_name ?? ""}`}
                  </td>
                  {moneyCells(cc)}
                </tr>
                {groupRows.map((r) => (
                  <tr
                    key={`s-${r.sub_cost_code_id ?? "uncat"}-${key}`}
                    className={`scc-row${r.sub_cost_code_id === null ? " uncategorized" : ""}`}
                  >
                    <td className="label">
                      {r.sub_cost_code_id === null ? (
                        "Uncategorized"
                      ) : (
                        <>
                          <span className="scc-num">{r.sub_cost_code_number}</span>
                          {r.sub_cost_code_name}
                        </>
                      )}
                    </td>
                    {moneyCells(r)}
                  </tr>
                ))}
              </Fragment>
            );
          })}
          {variance && (
            <tr className="totals-row">
              <td className="label">Total</td>
              {moneyCells(variance.totals, true)}
            </tr>
          )}
          {(!variance || variance.rows.length === 0) && (
            <tr>
              <td colSpan={7} className="empty-state">
                No budget lines, costs, or draws yet for this project.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Revisions */}
      <div className="revisions-panel">
        <div className="inline-li-header">
          <h3 className="line-items-heading">Revisions ({revisions.length})</h3>
          {budget.status === "active" && canCreate && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addChangeOrder}
              disabled={creatingCo}
            >
              {creatingCo ? "Creating…" : "+ Change Order"}
            </button>
          )}
        </div>

        <table className="data-table ledger-table">
          <thead>
            <tr>
              <th>Rev</th>
              <th>Type</th>
              <th>Title</th>
              <th>Status</th>
              <th>Effective</th>
              <th className="num">Net Impact</th>
              <th className="num">Running Total</th>
              <th>Approver</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((entry) => {
              const rev = entry.revision;
              const isExpanded = expanded.has(rev.public_id);
              const lines = lineItemsByRevision[rev.public_id];
              const lineStatus = lineItemStatusByRevision[rev.public_id];
              const unknownMark = (
                <span className="ledger-unknown" title="Line items not loaded">
                  …
                </span>
              );
              const detailMsg = lineStatus?.loading
                ? "Loading…"
                : lineStatus?.error
                  ? "Couldn't load line items."
                  : !lines || lines.length === 0
                    ? "No line items."
                    : null;

              return (
                <Fragment key={rev.public_id}>
                  <tr>
                    <td>
                      <button
                        type="button"
                        className="ledger-disclosure"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpanded(rev.public_id)}
                      >
                        <span className="ledger-disclosure-icon" aria-hidden="true">
                          {isExpanded ? "▼" : "▶"}
                        </span>
                        #{rev.revision_number}
                      </button>
                    </td>
                    <td>
                      {rev.type === "original" ? "Original" : "Change Order"}
                    </td>
                    <td>{rev.title ?? "—"}</td>
                    <td>
                      <span
                        className={`status-badge ${statusBadgeClass(rev.status)}`}
                      >
                        {STATUS_LABELS[rev.status] ?? rev.status}
                      </span>
                    </td>
                    <td>{fmtDate(rev.effective_date)}</td>
                    <td className="num">
                      {entry.netImpactCents === null ? (
                        unknownMark
                      ) : (
                        <MoneyCell
                          value={centsToAmount(entry.netImpactCents)}
                        />
                      )}
                    </td>
                    <td className="num">
                      {entry.runningTotalStatus === "pending" ? (
                        <span className="ledger-pending">Pending</span>
                      ) : entry.runningTotalStatus === "unknown" ? (
                        unknownMark
                      ) : (
                        <MoneyCell
                          value={centsToAmount(entry.runningTotalCents!)}
                        />
                      )}
                    </td>
                    <td>
                      {rev.approved_by_user_id != null ? (
                        <>
                          <div>
                            {userName.get(rev.approved_by_user_id) ?? "User"}
                          </div>
                          <div className="ledger-approver-date">
                            {fmtDate(rev.approved_datetime)}
                          </div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Link
                        to={`/budget/${id}/edit?rev=${rev.public_id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        {rev.status === "draft" ? "Edit lines" : "View lines"}
                      </Link>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="ledger-detail-row">
                      <td colSpan={9}>
                        {detailMsg !== null ? (
                          <div className="ledger-detail-empty">{detailMsg}</div>
                        ) : (
                          <div className="ledger-detail">
                            <div className="ledger-detail-header">
                              <span>Sub Cost Code</span>
                              <span>Description</span>
                              <span className="num">Qty</span>
                              <span className="num">Rate</span>
                              <span className="num">Amount</span>
                              <span className="num">Markup</span>
                              <span className="num">Price</span>
                            </div>
                            {lines?.map((li) => (
                              <div
                                className="ledger-detail-line"
                                key={li.public_id}
                              >
                                <span>
                                  {li.sub_cost_code_id != null ? (
                                    <>
                                      <span className="scc-num">
                                        {
                                          sccMap.get(li.sub_cost_code_id)
                                            ?.number
                                        }
                                      </span>
                                      {sccMap.get(li.sub_cost_code_id)?.name ??
                                        "Uncategorized"}
                                    </>
                                  ) : (
                                    "Uncategorized"
                                  )}
                                </span>
                                <span>{li.description ?? "—"}</span>
                                <span className="num">{li.quantity ?? "—"}</span>
                                <span className="num">
                                  {li.rate != null ? fmtMoney(li.rate) : "—"}
                                </span>
                                <span className="num">
                                  {li.amount != null ? fmtMoney(li.amount) : "—"}
                                </span>
                                <span className="num">{li.markup ?? "—"}</span>
                                <span className="num">
                                  {li.price != null ? fmtMoney(li.price) : "—"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {revisions.length === 0 && (
              <tr>
                <td colSpan={9} className="empty-state">
                  No revisions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Route-level page wrapper for /budget/:publicId. Reads the id from
 * useParams and delegates to BudgetViewContent.
 */
export default function BudgetView() {
  const { publicId } = useParams<{ publicId: string }>();
  if (!publicId) return null;
  return <BudgetViewContent publicId={publicId} />;
}
