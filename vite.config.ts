import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server talks directly to the prod API via VITE_API_BASE_URL (in .env).
// No /api proxy — if a call uses a relative path it's a bug; use client.ts
// helpers (rawRequest / getOne / getList / post / put / del) which prefix
// VITE_API_BASE_URL automatically.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
});
