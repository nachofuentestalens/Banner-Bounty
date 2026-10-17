import { buildServer } from "./app.js";
import { loadServerConfig } from "./config.js";

const config = loadServerConfig();
const { port, host } = config;

const app = buildServer({ dbPath: config.dbPath });

app
  .listen({ port, host })
  .then(() => {
    console.log(`[server] listening on http://${host}:${port}`);
  })
  .catch((error: unknown) => {
    console.error("[server] failed to start", error);
    process.exitCode = 1;
  });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().finally(() => process.exit(0));
  });
}
