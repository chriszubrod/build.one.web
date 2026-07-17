import type { Project } from "../../types/api";

/**
 * Client-side name / abbreviation filter for the Projects list.
 *
 * Matches `name` and `abbreviation` only (case-insensitive, trimmed query).
 * Empty or whitespace-only query returns all projects unchanged in order.
 * Returns a NEW array — never mutates the input, which is the React Query cache
 * payload (mutating it would corrupt the per-user cache).
 */
export function filterProjectsBySearch(
  projects: Project[],
  query: string,
): Project[] {
  const trimmed = query.trim();
  if (!trimmed) return [...projects];

  const needle = trimmed.toLowerCase();
  return projects.filter(
    (p) =>
      p.name.toLowerCase().includes(needle) ||
      (p.abbreviation?.toLowerCase().includes(needle) ?? false),
  );
}
