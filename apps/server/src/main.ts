import fs from "node:fs";
import path from "node:path";
import { buildServer } from "./app.js";
import { loadServerConfig } from "./config.js";

const config = loadServerConfig();
const { port, host, dbPath, webDistDir, debugToolsEnabled } = config;

const app = buildServer({ dbPath, webDistDir, debugToolsEnabled });

app
  .listen({ port, host })
  .then(() => {
    console.log(`[server] listening on http://${host}:${port}`);
    console.log(`[server] save database: ${dbPath}`);
    console.log(`[server] debug tools (level/XP/gold menu): ${debugToolsEnabled ? "ENABLED (DEBUG_TOOLS=1)" : "disabled"}`);
    if (webDistDir) {
      const built = fs.existsSync(path.join(webDistDir, "index.html"));
      console.log(
        built
          ? `[server] serving built client from ${webDistDir} at http://${host}:${port}/`
          : `[server] no built client at ${webDistDir}; run \`npm run build\` first (API still available)`,
      );
    }
  })
  .catch((error: unknown) => {
    if ((error as { code?: string }).code === "EADDRINUSE") {
      console.error(`[server] port ${port} is already in use on ${host}. Set API_PORT to a free port and retry.`);
    } else {
      console.error("[server] failed to start", error);
    }
    process.exitCode = 1;
    void app.close();
  });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().finally(() => process.exit(0));
  });
}
