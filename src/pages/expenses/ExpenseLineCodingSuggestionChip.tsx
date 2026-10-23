import type { ExpenseCodingSuggestResponse, Project, SubCostCode } from "../../types/api";
import {
  acceptProjectAriaLabel,
  acceptSccAriaLabel,
  expenseLineProjectSuggestionLabel,
  expenseLineSccSuggestionLabel,
  formatMemoCodingBadgeLabel,
  memoCodingBadgeClassName,
} from "./expenseCodingSuggestion";
import { parseConfidence } from "../bills/codingSuggestion";

export interface ExpenseLineCodingSlice {
  uid: string;
  sub_cost_code_id: string;
  project_id: string;
}

interface ExpenseLineCodingSuggestionChipProps {
  field: "sub_cost_code_id" | "project_id";
  line: ExpenseLineCodingSlice;
  suggestion: ExpenseCodingSuggestResponse | null | undefined;
  sccCatalog: SubCostCode[];
  projectCatalog: Project[];
  onAccept: (uid: string, field: "sub_cost_code_id" | "project_id", value: string) => void;
}

function AcceptControl({
  ariaLabel,
  onAccept,
}: {
  ariaLabel: string;
  onAccept: () => void;
}) {
  return (
    <button type="button" className="expense-coding-accept" aria-label={ariaLabel} onClick={onAccept}>
      Accept
    </button>
  );
}

export default function ExpenseLineCodingSuggestionChip({
  field,
  line,
  suggestion,
  sccCatalog,
  projectCatalog,
  onAccept,
}: ExpenseLineCodingSuggestionChipProps) {
  if (field === "sub_cost_code_id") {
    const label = expenseLineSccSuggestionLabel(line, suggestion, sccCatalog);
    const scc = suggestion?.sub_cost_code;
    if (!label || !scc) return null;
    const value = String(scc.id);
    const conf = parseConfidence(scc.confidence);
    const accept = () => onAccept(line.uid, "sub_cost_code_id", value);

    if (scc.source === "vendor_history") {
      return (
        <div className="expense-coding-vendor-hint">
          Vendor usually {label}{" "}
          <AcceptControl ariaLabel={acceptSccAriaLabel(label)} onAccept={accept} />
        </div>
      );
    }

    return (
      <div className="coding-suggestion-actions coding-suggestion-actions-compact">
        <span className={memoCodingBadgeClassName(conf)} title={scc.reason}>
          {formatMemoCodingBadgeLabel(scc.confidence)}
        </span>
        <AcceptControl ariaLabel={acceptSccAriaLabel(label)} onAccept={accept} />
      </div>
    );
  }

  const label = expenseLineProjectSuggestionLabel(line, suggestion, projectCatalog);
  const project = suggestion?.project;
  if (!label || !project) return null;
  const value = String(project.id);
  const conf = parseConfidence(project.confidence);

  return (
    <div className="coding-suggestion-actions coding-suggestion-actions-compact">
      <span className={memoCodingBadgeClassName(conf)} title={project.reason}>
        {formatMemoCodingBadgeLabel(project.confidence)}
      </span>
      <AcceptControl
        ariaLabel={acceptProjectAriaLabel(label)}
        onAccept={() => onAccept(line.uid, "project_id", value)}
      />
    </div>
  );
}
