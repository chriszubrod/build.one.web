#!/usr/bin/env node
/**
 * Report-only guard: compares the vendored iOS docs snapshot (src/docs/ios) against
 * the live build.one.ios source. Never writes files — regenerates the manifest to
 * stdout via gen_docs_manifest.py --out -, strips volatile `freshness` before
 * comparing JSON, and byte-compares narrative .md files. Skips cleanly when the
 * iOS repo is absent or python3 is unavailable. NOT wired into `npm run build`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  dest,
  FILES,
  iosDocsDir,
  iosGeneratorPath,
  iosPresent,
  MANIFEST_DEST,
} from "./ios-docs-shared.mjs";

/**
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") +
    "}"
  );
}

/**
 * Top-level keys whose (order-independent) content differs between two objects.
 * @param {Record<string, unknown>} a
 * @param {Record<string, unknown>} b
 * @returns {string[]}
 */
function differingTopLevelKeys(a, b) {
  const all = new Set([...Object.keys(a), ...Object.keys(b)]);
  /** @type {string[]} */
  const differing = [];
  for (const key of all) {
    if (stableStringify(a[key]) !== stableStringify(b[key])) {
      differing.push(key);
    }
  }
  return differing.sort();
}

// Top-level manifest keys that are generation provenance (when/where the snapshot
// was produced), NOT app shape — excluded from the drift comparison so a re-sync of
// unchanged source never reads as drift. Single home for this schema coupling.
const VOLATILE_TOP_LEVEL_KEYS = ["freshness"];

/**
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
function withoutVolatile(obj) {
  const rest = { ...obj };
  for (const key of VOLATILE_TOP_LEVEL_KEYS) delete rest[key];
  return rest;
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * @returns {Promise<
 *   | { status: "skip"; reason: string }
 *   | { status: "ok" }
 *   | { status: "drift"; drifts: string[] }
 *   | { status: "error"; reason: string }
 * >}
 */
export async function checkIosDocsFresh() {
  if (!iosPresent()) {
    return {
      status: "skip",
      reason: `iOS repo not present (${iosDocsDir})`,
    };
  }

  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
  } catch {
    return {
      status: "skip",
      reason: "python3 not available — cannot regenerate the iOS manifest to check drift",
    };
  }

  if (!existsSync(iosGeneratorPath)) {
    return {
      status: "error",
      reason: "iOS repo present but generator missing at " + iosGeneratorPath,
    };
  }

  /** @type {string} */
  let freshJson;
  try {
    freshJson = execFileSync("python3", [iosGeneratorPath, "--out", "-"], {
      encoding: "utf8",
    });
  } catch (err) {
    const message =
      err && typeof err === "object" && "stderr" in err && err.stderr
        ? String(err.stderr)
        : err instanceof Error
          ? err.message
          : String(err);
    return { status: "error", reason: "gen_docs_manifest.py failed: " + message };
  }

  /** @type {Record<string, unknown>} */
  let fresh;
  try {
    fresh = JSON.parse(freshJson);
  } catch {
    return { status: "error", reason: "gen_docs_manifest.py produced invalid JSON" };
  }

  if (!isPlainObject(fresh)) {
    return { status: "error", reason: "gen_docs_manifest.py produced a non-object manifest" };
  }

  /** @type {string[]} */
  const drifts = [];
  const committedPath = join(dest, MANIFEST_DEST);

  /** @type {Record<string, unknown> | null} */
  let committed = null;
  try {
    const parsed = JSON.parse(readFileSync(committedPath, "utf8"));
    if (isPlainObject(parsed)) {
      committed = parsed;
    } else {
      drifts.push("ios-manifest.json (committed copy is not a JSON object — corrupt)");
    }
  } catch {
    drifts.push("ios-manifest.json (committed copy missing or unparseable)");
  }

  if (committed) {
    const keys = differingTopLevelKeys(withoutVolatile(fresh), withoutVolatile(committed));
    if (keys.length) {
      drifts.push(`ios-manifest.json (content drift: keys <${keys.join(",")}>)`);
    }
  }

  for (const [src, out] of FILES) {
    if (out === MANIFEST_DEST) continue;

    const sourcePath = join(iosDocsDir, src);
    const destPath = join(dest, out);

    if (!existsSync(sourcePath)) {
      drifts.push(`${out} (source missing: ${sourcePath})`);
      continue;
    }

    try {
      const committedBytes = readFileSync(destPath);
      const sourceBytes = readFileSync(sourcePath);
      if (Buffer.compare(committedBytes, sourceBytes) !== 0) {
        drifts.push(`${out} (byte drift from ${src})`);
      }
    } catch {
      drifts.push(`${out} (committed copy missing)`);
    }
  }

  if (drifts.length) {
    return { status: "drift", drifts };
  }
  return { status: "ok" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkIosDocsFresh();

  if (result.status === "skip") {
    console.warn("⚠ Skipping iOS docs freshness check — " + result.reason);
    process.exit(0);
  }

  if (result.status === "ok") {
    console.log("✓ iOS docs snapshot is in sync with build.one.ios source.");
    process.exit(0);
  }

  if (result.status === "drift") {
    console.error("✗ iOS docs snapshot has DRIFTED from build.one.ios source:");
    for (const drift of result.drifts) {
      console.error("   - " + drift);
    }
    console.error(
      "→ Fix: run `npm run docs:sync:ios` (after regenerating in build.one.ios: python3 scripts/gen_docs_manifest.py)",
    );
    process.exit(1);
  }

  console.error("✗ iOS docs freshness check could not run: " + result.reason);
  process.exit(1);
}
