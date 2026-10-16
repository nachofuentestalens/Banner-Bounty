import { buildApp } from "./app.js";

const port = Number(process.env.SERVER_PORT ?? 3100);
const host = process.env.SERVER_HOST ?? "127.0.0.1";

const app = buildApp();

app
  .listen({ port, host })
  .then(() => {
    console.log(`[server] listening on http://${host}:${port}`);
  })
  .catch((err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[server] port ${port} is already in use. Set SERVER_PORT to a free port.`);
    } else {
      console.error("[server] failed to start:", err);
    }
    process.exit(1);
  });

function shutdown(signal: string) {
  console.log(`[server] received ${signal}, shutting down`);
  app
    .close()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
