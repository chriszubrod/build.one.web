/**
 * Loads the vendored iOS docs snapshot. The manifest + narrative are imported
 * as raw strings (typed by vite/client's `*?raw` declaration), so no
 * `resolveJsonModule` is required and the content is inlined into the bundle.
 *
 * These files are vendored from build.one.ios — regenerate + re-copy on each
 * iOS release (see the iOS repo's scripts/gen_docs_manifest.py).
 */
import rawManifest from "../../docs/ios/ios-manifest.json?raw";
import architectureMd from "../../docs/ios/architecture.md?raw";
import offlineMultiuserMd from "../../docs/ios/offline-multiuser.md?raw";
import distributionMd from "../../docs/ios/distribution.md?raw";
import type { IosManifest } from "./types";

// Renderable empty shape used only if the vendored JSON is malformed. Parsing
// is wrapped so a bad file degrades the /docs iOS section — not app boot.
const FALLBACK_MANIFEST: IosManifest = {
  repo: "build.one.ios",
  freshness: {
    class: "derived",
    live: false,
    source_commit: null,
    source_commit_date: null,
    source_branch: null,
    generated_at: "",
    note: "The iOS manifest could not be loaded. Regenerate it with scripts/gen_docs_manifest.py and run `npm run docs:sync:ios`.",
  },
  app: { name: "Build.One", bundle_id: "one.build.app", marketing_version: null, build: null, min_ios: null },
  architecture: { pattern: "—", networking: "—", persistence: "—", third_party_dependencies: 0 },
  features: [],
  services: [],
  endpoints: [],
  core_data_entities: [],
  privacy: { tracking: false, collected_data_types: [], required_reason_apis: [] },
  counts: { features: 0, services: 0, endpoints: 0, core_data_entities: 0, user_scoped_entities: 0 },
};

function parseManifest(): IosManifest {
  try {
    return JSON.parse(rawManifest) as IosManifest;
  } catch {
    return FALLBACK_MANIFEST;
  }
}

export const iosManifest = parseManifest();

export interface NarrativeDoc {
  id: string;
  title: string;
  body: string;
}

/** Curated, hand-authored narrative (the CURATED half of the iOS section). */
export const iosNarrative: NarrativeDoc[] = [
  { id: "architecture", title: "Architecture", body: architectureMd },
  {
    id: "offline-multiuser",
    title: "Offline-first & multi-user safety",
    body: offlineMultiuserMd,
  },
  { id: "distribution", title: "Distribution & release", body: distributionMd },
];
