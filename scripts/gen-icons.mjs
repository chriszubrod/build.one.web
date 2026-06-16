#!/usr/bin/env node
// One-shot icon generator. Reads public/icons/source/icon.svg and writes the
// PNG set the PWA manifest + Apple touch icon reference. Run manually after
// editing the source SVG; PNGs are committed to git so prod builds don't
// need sharp.
//
// Usage:  node scripts/gen-icons.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcSvg = path.join(root, "public/icons/source/icon.svg");
const outDir = path.join(root, "public/icons");

const TARGETS = [
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
  { size: 512, name: "icon-512-maskable.png" }, // same source; mask applied by OS
  { size: 180, name: "apple-touch-icon-180.png" },
];

const svgBuffer = await fs.readFile(srcSvg);
console.log(`Read source: ${srcSvg} (${svgBuffer.length} bytes)`);

for (const { size, name } of TARGETS) {
  const outPath = path.join(outDir, name);
  await sharp(svgBuffer, { density: 1024 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const stat = await fs.stat(outPath);
  console.log(`  wrote ${name.padEnd(28)}  ${size}x${size}  ${stat.size} bytes`);
}

console.log("Done.");
