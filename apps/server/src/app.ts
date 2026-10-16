import Fastify, { type FastifyInstance } from "fastify";
import type { HealthResponse } from "@bb/contracts";

const startedAt = Date.now();

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async (): Promise<HealthResponse> => {
    return { status: "ok", uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000) };
  });

  return app;
}
