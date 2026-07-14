import type { BudgetRevision, BudgetLineItem } from "../../types/api";

export function roundToCents(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export function netImpactCents(
  lineItems: BudgetLineItem[] | undefined,
): number {
  if (!lineItems || lineItems.length === 0) return 0;
  return lineItems.reduce((sum, li) => sum + roundToCents(li.price), 0);
}

/** Signed decimal string for MoneyCell — exact integer-cents conversion, no float drift. */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const hundredths = abs % 100;
  return `${sign}${dollars}.${String(hundredths).padStart(2, "0")}`;
}

export function isRevisionApproved(rev: BudgetRevision): boolean {
  return rev.status === "approved";
}

export interface LedgerEntry {
  revision: BudgetRevision;
  netImpactCents: number | null;
  approved: boolean;
  runningTotalCents: number | null;
  runningTotalStatus: "value" | "pending" | "unknown";
}

export function buildLedger(
  revisions: BudgetRevision[],
  lineItemsByRevision: Record<string, BudgetLineItem[] | undefined>,
): LedgerEntry[] {
  const sorted = [...revisions].sort(
    (a, b) => a.revision_number - b.revision_number,
  );
  let runningCents = 0;
  let runningUnknown = false;
  const entries: LedgerEntry[] = [];

  for (const revision of sorted) {
    const lines = lineItemsByRevision[revision.public_id];
    const impact = lines === undefined ? null : netImpactCents(lines);
    const approved = isRevisionApproved(revision);

    let runningTotalStatus: LedgerEntry["runningTotalStatus"];
    let runningTotalCents: number | null;

    if (!approved) {
      runningTotalStatus = "pending";
      runningTotalCents = null;
    } else if (impact === null || runningUnknown) {
      runningUnknown = true;
      runningTotalStatus = "unknown";
      runningTotalCents = null;
    } else {
      runningCents += impact;
      runningTotalStatus = "value";
      runningTotalCents = runningCents;
    }

    entries.push({
      revision,
      netImpactCents: impact,
      approved,
      runningTotalCents,
      runningTotalStatus,
    });
  }

  return entries;
}
