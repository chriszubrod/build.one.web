import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { findSection } from "./docsSections";
import DocsHome from "./DocsHome";
import IOSDocs from "./sections/IOSDocs";
import WebDocs from "./sections/WebDocs";
import ComingSoon from "./sections/ComingSoon";

/**
 * Admin-only documentation surface (/docs and /docs/:section). Dual-gated: the
 * nav entry is hidden from non-admins (menuConfig requiresAdmin), and this page
 * redirects a hand-typed URL away. Mirrors the TimeEntryCreate guard.
 *
 * NOTE: this gate is presentational, not access control. The docs content
 * (vendored iOS manifest + narrative) is bundled into the lazy /docs JS chunk,
 * so it is technically fetchable by any authenticated client. This is an
 * accepted trade-off — the content is intentionally non-sensitive (internal
 * repo map, relative API paths already shipped in the iOS binary, no secrets /
 * PII / tenant data / host URLs). If stricter gating is ever needed, move the
 * content behind an admin-authorized API endpoint and fetch it at runtime.
 *
 * /docs           → DocsHome (repository menu)
 * /docs/:section  → that repo's section (drill-down, with a back button)
 */
export default function DocsPage() {
  const { data: me, isLoading } = useCurrentUser();
  const { section } = useParams();
  const navigate = useNavigate();

  if (isLoading || !me) {
    return (
      <div className="ios-page">
        <div className="page-loading" style={{ padding: "var(--space-xl) 0" }}>
          Loading…
        </div>
      </div>
    );
  }
  if (!me.is_admin) return <Navigate to="/profile" replace />;

  if (!section) return <DocsHome />;

  const active = findSection(section);
  if (!active) return <Navigate to="/docs" replace />;

  const onBack = () => navigate("/docs");
  if (active.id === "ios") return <IOSDocs onBack={onBack} />;
  if (active.id === "web") return <WebDocs onBack={onBack} />;
  return <ComingSoon section={active} onBack={onBack} />;
}
