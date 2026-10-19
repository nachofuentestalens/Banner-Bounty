import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Root `npm run validate` runs test before build (typecheck && test && build),
// so packages/content's dist/ is not guaranteed to exist yet when this
// package's tests resolve its workspace dependency. Alias straight to
// content's source so `npm test` never depends on another package's build
// artifact being present.
export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: {
      "@banner-and-bounty/content": fileURLToPath(new URL("../content/src/index.ts", import.meta.url)),
    },
  },
});
