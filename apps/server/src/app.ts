import Fastify, { type FastifyInstance } from "fastify";

// M1-05 scaffold: only the public /health route from design/studio/contracts.md.
// Sessions, accounts and mutating endpoints are added by M1-07 onward.
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({
    ok: true,
    data: { status: "ok", schemaVersion: 0 },
  }));

  return app;
}
