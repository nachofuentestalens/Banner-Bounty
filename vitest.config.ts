import { defineConfig } from "vitest/config";

// Scopes `npm test` to the apps/packages workspace, keeping the
// dependency-free scripts/dashboard.test.mjs (run via `node --test`) separate.
export default defineConfig({
  test: {
    projects: [
      "packages/contracts",
      "packages/game",
      "packages/content",
      "apps/server",
      "apps/web",
    ],
  },
});
