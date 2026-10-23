import type { BillCodingBudgetCheck, ExpenseCodingBudget } from "../types/api";

export type CodingBudgetCheck = BillCodingBudgetCheck;

const WELL_FORMED_DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Parse a decimal money string to integer cents; null if blank or invalid. */
export function decimalToCents(str: string | null | undefined): bigint | null {
  if (str == null) return null;
  const raw = str.trim();
  if (raw === "") return null;
  if (!WELL_FORMED_DECIMAL.test(raw)) return null;

  let sign = 1n;
  let s = raw;
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("-")) {
    sign = -1n;
    s = s.slice(1);
  }

  const dot = s.indexOf(".");
  const intPart = dot >= 0 ? s.slice(0, dot) : s;
  const fracPart = dot >= 0 ? s.slice(dot + 1) : "";
  if (!/^0*$/.test(fracPart.slice(2))) return null;
  const cents = BigInt(intPart === "" ? "0" : intPart) * 100n + BigInt((fracPart + "00").slice(0, 2));
  return sign * cents;
}

/** Format integer cents as a fixed 2-decimal string (may be negative). */
export function centsToDecimal(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const dollars = abs / 100n;
  const frac = abs % 100n;
  return `${neg ? "-" : ""}${dollars.toString()}.${frac.toString().padStart(2, "0")}`;
}

function decimalAbsolute(decimal: string): string {
  const cents = decimalToCents(decimal);
  if (cents === null) return decimal.trim();
  return centsToDecimal(cents < 0n ? -cents : cents);
}

function formatUsdThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Display USD from a decimal string (sign stripped separately when needed). */
export function formatUsdDecimalString(decimal: string): string {
  const abs = decimalAbsolute(decimal);
  const dot = abs.indexOf(".");
  const intPart = dot >= 0 ? abs.slice(0, dot) : abs;
  const fracPart = dot >= 0 ? abs.slice(dot + 1) : "00";
  return `$${formatUsdThousands(intPart)}.${fracPart.padEnd(2, "0").slice(0, 2)}`;
}

export function budgetChip(
  check: CodingBudgetCheck | null | undefined,
  remaining: string | null | undefined,
): { label: string; className: string } | null {
  switch (check) {
    case "fits":
      return { label: "Within budget", className: "status-badge coding-budget-fits" };
    case "tight": {
      if (remaining == null || remaining === "") return null;
      return {
        label: `Tight: ${formatUsdDecimalString(remaining)} left`,
        className: "status-badge coding-budget-tight",
      };
    }
    case "over": {
      if (remaining == null || remaining === "") return null;
      return {
        label: `Over by ${formatUsdDecimalString(remaining)}`,
        className: "status-badge coding-budget-over",
      };
    }
    case "unbudgeted":
      return { label: "No budget line", className: "status-badge coding-budget-none" };
    case "no_budget":
      return { label: "No active budget", className: "status-badge coding-budget-none" };
    default:
      return null;
  }
}

/** Expense suggest: hide chip for no_budget / no_project / missing budget. */
export function expenseBudgetChip(
  budget: ExpenseCodingBudget,
): { label: string; className: string } | null {
  if (budget == null) return null;
  const { check, remaining } = budget;
  if (check === "no_budget") return null;
  return budgetChip(check, remaining);
}
