/**
 * Budget API surface (Phase 3) — typed wrappers over the shared client
 * helpers plus react-query keys, so the four budget pages share one
 * definition of the endpoint strings, payload shapes, and cache keys.
 *
 * The live convention (TimeEntryView etc.) calls getOne/getList/post/put/del
 * directly inside useQuery/useMutation; this module just centralizes the
 * budget-specific glue. Money is always a string on the wire — never coerce
 * a stored figure through float.
 */
import { getOne, getList, post, put, del } from "./client";
import type {
  Budget,
  BudgetListRow,
  BudgetCreateResult,
  BudgetRevision,
  BudgetLineItem,
  BudgetVariancePayload,
} from "../types/api";

/** Module name string the RBAC nav-gate matches (dbo.Module.Name). */
export const BUDGETS_MODULE = "Budgets";

/* ---- react-query keys -------------------------------------------------- */
export const budgetKeys = {
  list: ["budget-list"] as const,
  detail: (publicId: string) => ["budget", publicId] as const,
  variance: (publicId: string) => ["budget-variance", publicId] as const,
  revisions: (budgetPublicId: string) =>
    ["budget-revisions", budgetPublicId] as const,
  lineItems: (revisionPublicId: string) =>
    ["budget-line-items", revisionPublicId] as const,
  byProject: (projectPublicId: string) =>
    ["budget-by-project", projectPublicId] as const,
};

/* ---- reads ------------------------------------------------------------- */
export async function fetchBudgets(): Promise<BudgetListRow[]> {
  return (await getList<BudgetListRow>("/api/v1/get/budgets")).data;
}

export function fetchBudget(publicId: string): Promise<Budget> {
  return getOne<Budget>(`/api/v1/get/budget/${publicId}`);
}

/** Resolve the budget for a given Project. Returns null if no budget yet. */
export async function fetchBudgetByProject(
  projectPublicId: string,
): Promise<Budget | null> {
  try {
    return await getOne<Budget>(
      `/api/v1/get/budget/by-project/${projectPublicId}`,
    );
  } catch {
    // 404 = no budget for project; surface as null so the tab can prompt
    // the user to create one.
    return null;
  }
}

export function fetchBudgetVariance(
  publicId: string,
): Promise<BudgetVariancePayload> {
  return getOne<BudgetVariancePayload>(
    `/api/v1/get/budget/${publicId}/variance`,
  );
}

export async function fetchBudgetRevisions(
  budgetPublicId: string,
): Promise<BudgetRevision[]> {
  return (
    await getList<BudgetRevision>(
      `/api/v1/get/budget-revisions/by-budget/${budgetPublicId}`,
    )
  ).data;
}

export function fetchBudgetRevision(
  revisionPublicId: string,
): Promise<BudgetRevision> {
  return getOne<BudgetRevision>(
    `/api/v1/get/budget-revision/${revisionPublicId}`,
  );
}

export async function fetchBudgetLineItems(
  revisionPublicId: string,
): Promise<BudgetLineItem[]> {
  return (
    await getList<BudgetLineItem>(
      `/api/v1/get/budget-line-items/by-revision/${revisionPublicId}`,
    )
  ).data;
}

/* ---- mutations --------------------------------------------------------- */
export function createBudget(body: {
  project_public_id: string;
  notes?: string | null;
}): Promise<BudgetCreateResult> {
  return post<BudgetCreateResult>("/api/v1/create/budget", body);
}

export function updateBudget(
  publicId: string,
  body: { row_version: string; notes: string | null },
): Promise<Budget> {
  return put<Budget>(`/api/v1/update/budget/${publicId}`, body);
}

export function activateBudget(
  publicId: string,
  rowVersion: string,
): Promise<Budget> {
  return post<Budget>(`/api/v1/activate/budget/${publicId}`, {
    row_version: rowVersion,
  });
}

export function createRevision(body: {
  budget_public_id: string;
  type?: string;
  title?: string | null;
  description?: string | null;
  effective_date?: string | null;
}): Promise<BudgetRevision> {
  return post<BudgetRevision>("/api/v1/create/budget-revision", body);
}

export function updateRevision(
  publicId: string,
  body: {
    row_version: string;
    title: string | null;
    description: string | null;
    effective_date: string | null;
  },
): Promise<BudgetRevision> {
  return put<BudgetRevision>(
    `/api/v1/update/budget-revision/${publicId}`,
    body,
  );
}

export function approveRevision(
  publicId: string,
  rowVersion: string,
): Promise<BudgetRevision> {
  return post<BudgetRevision>(
    `/api/v1/approve/budget-revision/${publicId}`,
    { row_version: rowVersion },
  );
}

export interface BudgetLineItemBody {
  budget_revision_public_id: string;
  sub_cost_code_id: number | null;
  description: string | null;
  quantity: number | null;
  rate: number | null;
  amount: number | null;
  markup: number | null;
  price: number | null;
}

export function createLineItem(
  body: BudgetLineItemBody,
): Promise<BudgetLineItem> {
  return post<BudgetLineItem>("/api/v1/create/budget-line-item", body);
}

export function updateLineItem(
  publicId: string,
  body: Omit<BudgetLineItemBody, "budget_revision_public_id"> & {
    row_version: string;
  },
): Promise<BudgetLineItem> {
  return put<BudgetLineItem>(
    `/api/v1/update/budget-line-item/${publicId}`,
    body,
  );
}

export function deleteLineItem(publicId: string): Promise<unknown> {
  return del(`/api/v1/delete/budget-line-item/${publicId}`);
}

/* ---- display helpers --------------------------------------------------- */

/** Format a string|number money value as USD. Negatives render as -$N. */
export function fmtMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Sign class for variance/remaining cells: positive=good, negative=bad. */
export function signClass(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n) || n === 0) return "";
  return n > 0 ? "variance-pos" : "variance-neg";
}

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
  approved: "Approved",
};

/** Maps a budget/revision status to the shared .status-badge modifier. */
export function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
    case "approved":
      return "active";
    case "draft":
      return "draft";
    case "archived":
      return "declined";
    default:
      return "";
  }
}
