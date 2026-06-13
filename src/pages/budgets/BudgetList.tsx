import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import {
  fetchBudgets,
  budgetKeys,
  fmtMoney,
  signClass,
  statusBadgeClass,
  STATUS_LABELS,
  BUDGETS_MODULE,
} from "../../api/budget";
import type { BudgetListRow } from "../../types/api";

export default function BudgetList() {
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const canCreate = !!(
    me?.is_admin ||
    me?.modules?.find((m) => m.name === BUDGETS_MODULE)?.can_create
  );

  const { data, isLoading, error } = useQuery({
    queryKey: budgetKeys.list,
    queryFn: fetchBudgets,
  });

  if (isLoading) return <div className="page-loading">Loading…</div>;
  if (error)
    return (
      <div className="page-error">
        {error instanceof Error ? error.message : "Failed to load budgets."}
      </div>
    );

  const budgets = data ?? [];

  return (
    <div className="page budget-page">
      <PageHeader
        title="Budgets"
        count={budgets.length}
        createPath={canCreate ? "/budget/create" : undefined}
        createLabel="New Budget"
      />

      <table className="data-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Status</th>
            <th className="num">Contract Value</th>
            <th className="num">Drawn</th>
            <th className="num">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {budgets.map((b: BudgetListRow) => (
            <tr
              key={b.public_id}
              className="clickable-row"
              onClick={() => navigate(`/budget/${b.public_id}`)}
            >
              <td>{b.project_name ?? "—"}</td>
              <td>
                <span className={`status-badge ${statusBadgeClass(b.status)}`}>
                  {STATUS_LABELS[b.status] ?? b.status}
                </span>
              </td>
              <td className="num">{fmtMoney(b.contract_value)}</td>
              <td className="num">{fmtMoney(b.drawn_price)}</td>
              <td className={`num ${signClass(b.remaining_to_draw)}`}>
                {fmtMoney(b.remaining_to_draw)}
              </td>
            </tr>
          ))}
          {budgets.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-state">
                No budgets yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
