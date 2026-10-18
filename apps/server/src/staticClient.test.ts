import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./app.js";

describe("built client served by the API", () => {
  let root: string;
  let dist: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "bnb-static-"));
    dist = path.join(root, "dist");
    fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
    fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>B&B</title>");
    fs.writeFileSync(path.join(dist, "assets", "app-abc.js"), "console.log(1)");
    fs.writeFileSync(path.join(root, "secret.txt"), "outside dist");
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it("serves index.html at / and fingerprinted assets with content types", async () => {
    const app = buildServer({ webDistDir: dist });
    const index = await app.inject({ method: "GET", url: "/" });
    expect(index.statusCode).toBe(200);
    expect(index.headers["content-type"]).toContain("text/html");
    expect(index.headers["cache-control"]).toBe("no-cache");
    const asset = await app.inject({ method: "GET", url: "/assets/app-abc.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["content-type"]).toContain("text/javascript");
    await app.close();
  });

  it("keeps API routes authoritative and unknown paths as not_found envelopes", async () => {
    const app = buildServer({ webDistDir: dist });
    expect((await app.inject({ method: "GET", url: "/health" })).json().ok).toBe(true);
    for (const url of ["/account/nope", "/assets/missing.js", "/..%2Fsecret.txt", "/%2e%2e/secret.txt"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json().error.code, url).toBe("not_found");
    }
    // Malformed percent-encoding is rejected by Fastify's router before any file lookup.
    const malformed = await app.inject({ method: "GET", url: "/%E0%A4%A" });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).not.toContain("outside dist");
    const post = await app.inject({ method: "POST", url: "/index.html" });
    expect(post.statusCode).toBe(404);
    await app.close();
  });

  it("serves nothing when no dist directory is configured", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ ok: false, error: { code: "not_found" } });
    await app.close();
  });
});
