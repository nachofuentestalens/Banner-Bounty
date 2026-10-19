import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { ERROR_STATUS } from "../errors.js";

// Serves the built apps/web client from the API process for the one-process
// release preview (design/studio/tech-stack.md). Only GET/HEAD requests that
// match no API route reach this handler: "/" serves index.html, any other path
// serves an existing file under the dist directory, and everything else gets
// the contract's not_found envelope (never index.html, so a mistyped API path
// is not masked as a page).
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function resolveClientFile(distDir: string, urlPath: string): string | null {
  const pathname = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const root = path.resolve(distDir);
  const candidate = path.resolve(root, relative);
  // Path traversal guard: the resolved file must stay inside the dist root.
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  try {
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

export function registerStaticClient(app: FastifyInstance, distDir: string | undefined): void {
  app.setNotFoundHandler((request, reply) => {
    let file: string | null = null;
    if (distDir && (request.method === "GET" || request.method === "HEAD")) {
      try {
        file = resolveClientFile(distDir, request.url);
      } catch {
        file = null; // malformed percent-encoding
      }
    }
    if (!file) {
      reply.status(ERROR_STATUS.not_found).send({
        ok: false,
        error: { code: "not_found", message: "no such route", correlationId: crypto.randomUUID() },
      });
      return;
    }
    const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    // Vite fingerprints asset names, so they may be cached; index.html must not be.
    const cache = file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable";
    reply.header("content-type", type).header("cache-control", cache).send(fs.readFileSync(file));
  });
}
