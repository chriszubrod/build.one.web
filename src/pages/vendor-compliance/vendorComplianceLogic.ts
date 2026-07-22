export const SLOT_ORDER = ["BUSINESS_LICENSE", "CONTRACTORS_LICENSE", "CERTIFICATE_OF_INSURANCE", "W9"] as const;

export const SLOT_LABELS: Record<string, string> = {
  BUSINESS_LICENSE: "Business License",
  CONTRACTORS_LICENSE: "Contractor's License",
  CERTIFICATE_OF_INSURANCE: "Certificate of Insurance",
  W9: "W-9",
};

export const VALIDITY_LABELS: Record<string, string> = {
  valid: "Valid", expiring: "Expiring soon", expired: "Expired",
  incomplete: "Incomplete", missing: "Missing", present: "On file",
};

// CSS modifier suffix -> use as `compliance-badge compliance-badge--${validityClass(status)}`
export function validityClass(status: string): string {
  switch (status) {
    case "valid": case "present": return "valid";
    case "expiring": return "expiring";
    case "expired": return "expired";
    case "incomplete": return "incomplete";
    default: return "missing";
  }
}

export function validityLabel(status: string): string {
  return VALIDITY_LABELS[status] ?? "Missing";
}

// Human hint from days_until_expiry: e.g. 12 -> "in 12 days", 0 -> "today", -3 -> "3 days ago", null -> "".
export function expiryHint(days: number | null | undefined): string {
  if (days === null || days === undefined) return "";
  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
  const n = Math.abs(days);
  return `${n} day${n === 1 ? "" : "s"} ago`;
}

export const COVERAGE_LABELS: Record<string, string> = {
  GL: "General Liability",
  WC: "Workers' Comp",
  OTHER: "Other",
  AUTO: "Auto",
  UMBRELLA: "Umbrella",
};

export function coverageLabel(t: string): string {
  return COVERAGE_LABELS[t] ?? t;
}
