/**
 * Loads the build-time web route snapshot. The manifest is imported as a raw
 * string (typed by vite/client's `*?raw` declaration), so no
 * `resolveJsonModule` is required and the content is inlined into the bundle.
 *
 * Regenerate on every build via scripts/gen-web-docs-manifest.mjs
 * (`npm run docs:sync:web`).
 */
import rawManifest from "../../docs/web/web-manifest.json?raw";
import type { WebManifest } from "./types";

// Renderable empty shape used only if the vendored JSON is malformed. Parsing
// is wrapped so a bad file degrades the /docs Web section — not app boot.
const FALLBACK_MANIFEST: WebManifest = {
  repo: "build.one.web",
  freshness: {
    class: "derived",
    live: false,
    source_commit: null,
    source_commit_date: null,
    source_branch: null,
    generated_at: "",
    note: "The web manifest could not be loaded. Regenerate it with `npm run docs:sync:web`.",
  },
  app: {
    name: "build.one.web",
    framework: "React 19 · Vite · react-router-dom 7",
    landing: "LandingRedirect — Time Tracking or Profile by RBAC",
  },
  counts: {
    routes: 0,
    nav_reachable: 0,
    protected: 0,
    public: 0,
    admin_only: 0,
    redirects: 0,
  },
  routes: [],
};

function parseManifest(): WebManifest {
  try {
    return JSON.parse(rawManifest) as WebManifest;
  } catch {
    return FALLBACK_MANIFEST;
  }
}

export const webManifest = parseManifest();
