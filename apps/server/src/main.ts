import { buildServer } from "./app.js";

const port = Number(process.env.API_PORT ?? 3100);
const host = process.env.API_HOST ?? "127.0.0.1";

const app = buildServer();

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
