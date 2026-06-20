#!/usr/bin/env node
/**
 * Vendors the iOS docs snapshot (manifest + curated narrative) from the sibling
 * build.one.ios repo into this repo, so the /docs iOS section renders the latest
 * derived facts + prose. Run after regenerating on an iOS release:
 *
 *   (in build.one.ios)  python3 scripts/gen_docs_manifest.py
 *   (in build.one.web)  npm run docs:sync:ios
 *
 * Replaces the error-prone manual `cp`. Fails loudly if the iOS repo or any
 * source file is missing.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const iosDocs = join(webRoot, "..", "build.one.ios", "docs");
const dest = join(webRoot, "src", "docs", "ios");

// [source relative to build.one.ios/docs, destination filename]
const FILES = [
  ["ios-manifest.json", "ios-manifest.json"],
  ["app-guide/architecture.md", "architecture.md"],
  ["app-guide/offline-multiuser.md", "offline-multiuser.md"],
  ["app-guide/distribution.md", "distribution.md"],
];

if (!existsSync(iosDocs)) {
  console.error(`✗ iOS docs not found at ${iosDocs}.`);
  console.error("  Is build.one.ios checked out as a sibling of build.one.web?");
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const [src, out] of FILES) {
  const from = join(iosDocs, src);
  if (!existsSync(from)) {
    console.error(`✗ Missing source: ${from}`);
    console.error("  Run scripts/gen_docs_manifest.py in build.one.ios first.");
    process.exit(1);
  }
  copyFileSync(from, join(dest, out));
  console.log(`  vendored ${out}`);
}
console.log("✓ iOS docs synced into src/docs/ios/");
