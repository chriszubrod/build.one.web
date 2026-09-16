/**
 * U-471 — shown when a token rebase was refused because the freshly-arrived
 * record diverged from the last-in-sync baseline on an editable field.
 *
 * Reload is a full `window.location.reload()` on purpose: it remounts
 * everything, so there is no partial-reset enumeration to go stale, and
 * since U-461 stopped persisting `['item', ...]` to IndexedDB a reload now
 * genuinely refetches instead of rehydrating the same stale record off
 * disk (that rehydration was the original 2026-09-15 incident). Confirm
 * first: this banner is shown only when local edits cannot be saved, and
 * a reload throws that work away.
 */
export const RECORD_CHANGED_CONFIRM =
  "Reload this page? Unsaved changes on this page will be lost.";

export default function RecordChangedBanner({ entity }: { entity: string }) {
  return (
    <div className="form-error record-changed-banner" role="status">
      <span>This {entity} was changed in another window.</span>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          if (!window.confirm(RECORD_CHANGED_CONFIRM)) return;
          window.location.reload();
        }}
      >
        Reload
      </button>
    </div>
  );
}
