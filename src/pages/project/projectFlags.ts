import type { Project } from "../../types/api";

/**
 * `is_cost_plus` is null when the api read the project through a sproc that
 * does not yet project the column, and absent on payloads cached before
 * U-099. Neither is evidence either way, so neither renders as "Yes": an
 * unknown value can conceal a stored false.
 */
export function isCostPlusLabel(p: Pick<Project, "is_cost_plus">): "Yes" | "No" | "Unknown" {
  if (p.is_cost_plus === true) return "Yes";
  if (p.is_cost_plus === false) return "No";
  return "Unknown";
}
