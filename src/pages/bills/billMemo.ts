/** Ramp-style bill memo composed from live line values + PDF read fields. */

export interface BillMemoLineSlice {
  project_public_id: string;
  sub_cost_code_id: string;
  description: string;
}

export interface ComposeBillMemoParams {
  enteredBy: string;
  populatedLines: BillMemoLineSlice[];
  projectLabelForLine: (line: BillMemoLineSlice) => string | null;
  costCodeNumberForLine: (line: BillMemoLineSlice) => string | null;
  longDescription: string | null;
  reference: string | null;
}

function nonEmpty(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
}

function projectSegment(
  populatedLines: BillMemoLineSlice[],
  projectLabelForLine: (line: BillMemoLineSlice) => string | null,
): string | null {
  if (populatedLines.length === 0) return null;
  const ids = populatedLines
    .map((l) => l.project_public_id)
    .filter((id) => id !== "");
  if (populatedLines.length > 1 && ids.length > 1 && new Set(ids).size > 1) {
    return "Multiple";
  }
  return projectLabelForLine(populatedLines[0]);
}

function costCodeSegment(
  populatedLines: BillMemoLineSlice[],
  costCodeNumberForLine: (line: BillMemoLineSlice) => string | null,
): string | null {
  if (populatedLines.length === 0) return null;
  const ids = populatedLines
    .map((l) => l.sub_cost_code_id)
    .filter((id) => id !== "");
  if (populatedLines.length > 1 && ids.length > 1 && new Set(ids).size > 1) {
    return "Multiple";
  }
  return costCodeNumberForLine(populatedLines[0]);
}

export function composeBillMemo(params: ComposeBillMemoParams): string {
  const enteredBy = nonEmpty(params.enteredBy);
  const shortDescription = nonEmpty(params.populatedLines[0]?.description ?? "");
  const project = nonEmpty(
    projectSegment(params.populatedLines, params.projectLabelForLine) ?? "",
  );
  const costCode = nonEmpty(
    costCodeSegment(params.populatedLines, params.costCodeNumberForLine) ?? "",
  );
  const longDescription = nonEmpty(params.longDescription);
  const reference = nonEmpty(params.reference);

  const head = [enteredBy, project, costCode, shortDescription].filter(Boolean).join(" - ");
  const tail: string[] = [];
  if (longDescription) tail.push(longDescription);
  if (reference) tail.push(`Ref: ${reference}`);

  if (tail.length === 0) return head;
  if (head === "") return tail.join(" | ");
  return `${head} | ${tail.join(" | ")}`;
}
