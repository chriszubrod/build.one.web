import { Smartphone } from "lucide-react";

/**
 * Full-screen overlay shown only on phones in landscape orientation.
 * Visibility is driven entirely by the `.rotate-overlay` CSS — gated on
 * `(orientation: landscape) and (max-height: 500px)` so tablets in
 * landscape don't trigger it (iPad in landscape is 768px tall).
 *
 * Always mounted in AppLayout so a mid-session rotation flips it on
 * without re-rendering.
 */
export default function RotateOverlay() {
  return (
    <div className="rotate-overlay" role="alert" aria-live="polite">
      <Smartphone className="rotate-overlay-icon" size={56} strokeWidth={1.5} />
      <h2 className="rotate-overlay-title">Please rotate your phone</h2>
      <p className="rotate-overlay-body">
        This app is designed for portrait orientation. Rotate your device
        back to portrait to continue.
      </p>
    </div>
  );
}
