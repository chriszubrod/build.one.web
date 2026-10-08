import type { Project } from "../../types/api";

/** Joins abbreviation and customer name with " · "; undefined when both are absent. */
export function projectSubtitle(
  p: Pick<Project, "abbreviation" | "customer_name">,
): string | undefined {
  return [p.abbreviation, p.customer_name].filter(Boolean).join(" · ") || undefined;
}
