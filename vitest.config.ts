import { defineConfig } from "vitest/config";
import path from "node:path";

// Pin a US time zone so date-only formatting bugs (UTC midnight shown as the
// previous day) go red on every machine, not only on a US-zoned laptop.
process.env.TZ = "America/Chicago";

export default defineConfig({
  resolve: {
    alias: {
      "virtual:pwa-register": path.resolve(
        __dirname,
        "src/__testutils__/pwaRegisterStub.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
