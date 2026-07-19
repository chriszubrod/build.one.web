/**
 * Shared paths and file list for iOS docs sync (writer) and freshness check (reader).
 * Single source of truth so sync and check never disagree on scope.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const iosRepoRoot = process.env.BUILD_ONE_IOS_DIR
  ? resolve(process.env.BUILD_ONE_IOS_DIR)
  : join(webRoot, "..", "build.one.ios");

export const iosDocsDir = join(iosRepoRoot, "docs");
export const iosGeneratorPath = join(iosRepoRoot, "scripts", "gen_docs_manifest.py");
export const dest = join(webRoot, "src", "docs", "ios");

/** @type {[string, string][]} [srcRelativeToIosDocs, destFilename] */
export const FILES = [
  ["ios-manifest.json", "ios-manifest.json"],
  ["app-guide/architecture.md", "architecture.md"],
  ["app-guide/offline-multiuser.md", "offline-multiuser.md"],
  ["app-guide/distribution.md", "distribution.md"],
];

export const MANIFEST_DEST = "ios-manifest.json";

/** @returns {boolean} */
export function iosPresent() {
  return existsSync(iosDocsDir);
}
