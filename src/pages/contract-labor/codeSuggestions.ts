import type { SubCostCode } from "../../types/api";

/**
 * Resolve the suggestion API's SubCostCode ids against the loaded code list,
 * keeping the API's order. Ids not in `codesById` (deleted / not visible) are
 * dropped, as are repeats. An empty result means "render the plain list".
 */
export function resolveSuggestedCodes(
  suggestedIds: readonly number[] | undefined,
  codesById: ReadonlyMap<number, SubCostCode>,
): SubCostCode[] {
  // Map keeps first-insertion order, so API order survives and repeats collapse.
  const out = new Map<number, SubCostCode>();
  for (const id of suggestedIds ?? []) {
    const code = codesById.get(id);
    if (code && !out.has(id)) out.set(id, code);
  }
  return [...out.values()];
}

/** Option label shared by the Suggested and All codes groups. */
export function subCostCodeLabel(s: SubCostCode): string {
  return `${s.number} - ${s.description || s.name}`;
}
