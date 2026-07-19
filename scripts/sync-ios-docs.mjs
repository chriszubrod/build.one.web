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
import { join } from "node:path";
import { dest, FILES, iosDocsDir, iosPresent } from "./ios-docs-shared.mjs";

if (!iosPresent()) {
  console.error(`✗ iOS docs not found at ${iosDocsDir}.`);
  console.error("  Is build.one.ios checked out as a sibling of build.one.web?");
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const [src, out] of FILES) {
  const from = join(iosDocsDir, src);
  if (!existsSync(from)) {
    console.error(`✗ Missing source: ${from}`);
    console.error("  Run scripts/gen_docs_manifest.py in build.one.ios first.");
    process.exit(1);
  }
  copyFileSync(from, join(dest, out));
  console.log(`  vendored ${out}`);
}
console.log("✓ iOS docs synced into src/docs/ios/");
