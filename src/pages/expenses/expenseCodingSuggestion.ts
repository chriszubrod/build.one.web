import { projectOptionLabel, sccOptionLabel } from "../../components/ui/pickerOptions";
import type { ExpenseCodingSuggestResponse, Project, SubCostCode } from "../../types/api";
import {
  BILL_LINE_CHIP_CLASS,
  confidenceDisplayPct,
  confidenceRawPct,
  parseConfidence,
  suggestionBadgeClassName,
} from "../bills/codingSuggestion";

export { BILL_LINE_CHIP_CLASS };

export function expenseCodingSuggestPath(expensePublicId: string): string {
  return `/api/v1/expense/${expensePublicId}/coding/suggest`;
}

export function expenseHasEmptyCodingField(
  lines: { sub_cost_code_id: string; project_id: string }[],
): boolean {
  return lines.some((li) => li.sub_cost_code_id === "" || li.project_id === "");
}

export function expenseLineSccSuggestionLabel(
  line: { sub_cost_code_id: string },
  suggestion: ExpenseCodingSuggestResponse | null | undefined,
  sccCatalog: SubCostCode[],
): string | null {
  if (line.sub_cost_code_id !== "") return null;
  const scc = suggestion?.sub_cost_code;
  if (!scc) return null;
  const code = sccCatalog.find((c) => c.id === scc.id);
  if (!code) return null;
  return sccOptionLabel(code);
}

export function expenseLineProjectSuggestionLabel(
  line: { project_id: string },
  suggestion: ExpenseCodingSuggestResponse | null | undefined,
  projectCatalog: Project[],
): string | null {
  if (line.project_id !== "") return null;
  const project = suggestion?.project;
  if (!project) return null;
  const row = projectCatalog.find((p) => p.id === project.id);
  if (!row) return null;
  const label = projectOptionLabel(row.abbreviation, row.name ?? "");
  return label || null;
}

function isHighConfidence(conf: number | null): boolean {
  const raw = confidenceRawPct(conf);
  return raw != null && raw >= 85;
}

export function memoCodingBadgeClassName(conf: number | null): string {
  const base = `${suggestionBadgeClassName(conf)} ${BILL_LINE_CHIP_CLASS}`;
  return isHighConfidence(conf) ? `${base} coding-suggested-high` : base;
}

export function formatMemoCodingBadgeLabel(conf: number | null | undefined): string {
  const pct = confidenceDisplayPct(parseConfidence(conf));
  if (pct == null) return "Suggested";
  return `Suggested ${pct}%`;
}

export function acceptSccAriaLabel(label: string): string {
  return `Accept suggested sub cost code ${label}`;
}

export function acceptProjectAriaLabel(label: string): string {
  return `Accept suggested project ${label}`;
}
