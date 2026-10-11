import type { ExpenseLineItem, Project } from "../../types/api";

/**
 * Expense line billable state mirrors the API (U-646): undecided rows follow the
 * coded project's cost-plus flag at recode time; a person-stamped row keeps its
 * value through QBO pull and is sent to QuickBooks as-is.
 */
export type BillableRow = {
  uid: string;
  project_id: string;
  is_billable: boolean;
  billable_decided: boolean;
};

/** Value shown in the editor checkbox — decided rows use the stored choice; otherwise project default when known. */
export function effectiveBillable(
  row: BillableRow,
  project?: Pick<Project, "is_cost_plus"> | undefined,
): boolean {
  if (row.billable_decided) return row.is_billable;
  if (project?.is_cost_plus === true) return true;
  if (project?.is_cost_plus === false) return false;
  return row.is_billable;
}

/** Applies inline edits: detect explicit billable toggles, recompute on project change when still undecided. */
export function applyLineEdits<T extends BillableRow>(
  prev: T[],
  next: T[],
  projectFor: (projectId: string) => Pick<Project, "is_cost_plus"> | undefined,
): T[] {
  const prevByUid = new Map(prev.map((r) => [r.uid, r]));
  return next.map((nextRow) => {
    const prevRow = prevByUid.get(nextRow.uid);
    let billable_decided = prevRow?.billable_decided ?? nextRow.billable_decided;
    let is_billable = nextRow.is_billable;

    if (prevRow) {
      if (prevRow.project_id !== nextRow.project_id) {
        if (!billable_decided) {
          is_billable = effectiveBillable(
            { ...nextRow, is_billable, billable_decided: false },
            projectFor(nextRow.project_id),
          );
        }
      } else if (prevRow.is_billable !== nextRow.is_billable) {
        billable_decided = true;
      }
    } else if (!billable_decided) {
      is_billable = effectiveBillable(
        { ...nextRow, is_billable, billable_decided: false },
        projectFor(nextRow.project_id),
      );
    }

    return { ...nextRow, is_billable, billable_decided };
  });
}

/** Short hint under the Billable checkbox in the expense editor. */
export function billableHint(
  row: BillableRow,
  project?: Pick<Project, "is_cost_plus"> | undefined,
): "decided" | "project default" | null {
  if (row.billable_decided) return "decided";
  if (project?.is_cost_plus != null) return "project default";
  return null;
}

/** UPDATE body fragment — null is_billable tells the API to leave storage alone and recode from project. */
export function billablePayload(row: BillableRow): {
  is_billable: boolean | null;
  billable_decided?: true;
} {
  if (row.billable_decided) {
    return { is_billable: row.is_billable, billable_decided: true };
  }
  return { is_billable: null };
}

/** Read-only Billable column — no project context on the view page. */
export function billableViewLabel(
  li: Pick<ExpenseLineItem, "is_billable" | "billable_decided_at">,
): string {
  if (li.is_billable === null) return "";
  const base = li.is_billable ? "Yes" : "No";
  if (li.billable_decided_at) {
    const datePart = li.billable_decided_at.slice(0, 10);
    return `${base} · decided ${datePart}`;
  }
  return base;
}
