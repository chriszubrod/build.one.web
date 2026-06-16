import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Dev server talks directly to the prod API via VITE_API_BASE_URL (in .env).
// No /api proxy — if a call uses a relative path it's a bug; use client.ts
// helpers (rawRequest / getOne / getList / post / put / del) which prefix
// VITE_API_BASE_URL automatically.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // PWA Tier 2 — switched to injectManifest so src/sw.ts owns the
      // routing/caching logic. Tier 1 used generateSW for the shell-only
      // case; Tier 2 needs per-pattern strategies (NetworkFirst for
      // read endpoints, NetworkOnly for mutations / auth / attachments)
      // that the declarative generateSW config can't express precisely.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      // Don't auto-include the source SVG under /icons/source/.
      includeAssets: [],
      manifest: {
        name: "Build One",
        short_name: "Build One",
        description: "Build One — time tracking and back-office app",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#1a1816",
        background_color: "#f4f2ee",
        lang: "en",
        dir: "ltr",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        // What gets precached (the shell — Workbox injects the list into
        // self.__WB_MANIFEST inside src/sw.ts at build time).
        globPatterns: [
          "**/*.{js,css,html,svg,png,ico,webmanifest,woff2}",
        ],
        // 5 MB precache cap — current bundle is ~360 KB so plenty of headroom.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 3000,
  },
});
