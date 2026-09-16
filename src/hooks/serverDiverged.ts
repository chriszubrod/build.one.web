/**
 * U-471 — three-way-merge base test for a token rebase.
 *
 * A write token (`row_version`) is the authorisation to overwrite, not data.
 * Copying a freshly-arrived token into a form whose editable fields still
 * hold an older read makes that stale body submittable — a silent lost
 * update on a money document. Before U-464/U-465 that save 409'd (ugly,
 * but a correct refusal). After those units it succeeded.
 *
 * A rebase is safe if and only if `freshProjection` differs from `baseline`
 * ONLY in `owned` keys. `baseline` is the server's editable values as of
 * the last moment the form was in sync with the server (the seed, then
 * every confirmed save).
 *
 * Failure asymmetry is the whole safety argument: a field wrongly left OUT
 * of `owned` makes us refuse to rebase (degraded, not dangerous). Only a
 * field wrongly put INTO `owned` can corrupt. Every projected value is a
 * primitive; comparison is shallow `!==`. Do not add a deep-equal library.
 */
export function serverDiverged(
  baseline: object,
  freshProjection: object,
  owned: readonly string[],
): boolean {
  const ownedSet = new Set(owned);
  const left = baseline as Record<string, unknown>;
  const right = freshProjection as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (ownedSet.has(key)) continue;
    if (left[key] !== right[key]) return true;
  }
  return false;
}
